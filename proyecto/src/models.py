"""Modelos de proyección. Cada uno solo ve el panel hasta el origen.

El modelo principal es un Ridge directo: para cada horizonte ``h`` se predice
``y_{t+h} - y_t`` con las variables de ``t``, estandarizadas con la media y la
desviación de los pares de entrenamiento. La penalización es λ = 5 sobre las
variables estandarizadas y el intercepto no se penaliza. La proyección es
``y_t`` más ese cambio. No se proyectan las explicativas.

Los modelos iterativos (AR, SARIMAX, VAR, VECM) generan la senda y, si el
ajuste no converge o el pronóstico no es finito, dejan la tasa del origen y
cuentan el caso en ``fallos``. Esa sustitución queda visible en el informe.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import ElasticNet, Ridge
from sklearn.preprocessing import StandardScaler
from statsmodels.tsa.ar_model import AutoReg, ar_select_order
from statsmodels.tsa.api import VAR
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.vector_ar.vecm import VECM

from src.config import (
    FEATURES_AGREGADOS,
    FEATURES_TASA_POLITICA,
    MIN_FILAS_RIDGE,
    NOMBRES_MODELO,
    RIDGE_LAMBDA,
)
from src.features import pares_directos


@dataclass
class AjusteRidge:
    """Ajuste de un horizonte, útil para auditar el escalado y los coeficientes."""

    horizonte: int
    columnas: tuple[str, ...]
    coeficientes: dict[str, float]
    intercepto: float
    media: np.ndarray
    desviacion: np.ndarray
    n: int
    cambio: float
    nivel: float
    alpha: float


class ModeloBase:
    """Contrato común: devolver el nivel proyectado de la tasa."""

    id: str
    nombre: str

    def __init__(self, id_modelo: str) -> None:
        self.id = id_modelo
        self.nombre = NOMBRES_MODELO[id_modelo]
        self.fallos = 0

    def proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int] | tuple[int, ...],
    ) -> dict[int, float]:
        """Nivel de la tasa en cada horizonte, usando solo datos hasta el origen."""
        if origen_iloc < 0 or origen_iloc >= len(panel):
            raise IndexError("El origen queda fuera del panel.")
        hs = [int(h) for h in horizontes]
        if any(h < 1 for h in hs):
            raise ValueError("Los horizontes tienen que ser positivos.")
        try:
            salida = self._proyectar(panel, origen_iloc, hs)
            niveles = {h: float(salida[h]) for h in hs}
        except Exception:
            if self._puede_sustituir():
                self.fallos += 1
                tasa = float(panel["y"].iloc[origen_iloc])
                return {h: tasa for h in hs}
            raise
        if not all(np.isfinite(nivel) for nivel in niveles.values()):
            if self._puede_sustituir():
                self.fallos += 1
                tasa = float(panel["y"].iloc[origen_iloc])
                return {h: tasa for h in hs}
            raise ValueError(f"{self.nombre} produjo un pronóstico no finito.")
        return niveles

    def _puede_sustituir(self) -> bool:
        return False

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        raise NotImplementedError


def ajustar_ridge(
    panel: pd.DataFrame,
    origen_iloc: int,
    horizonte: int,
    columnas: tuple[str, ...] = FEATURES_AGREGADOS,
    alpha: float = RIDGE_LAMBDA,
) -> AjusteRidge:
    """Ajusta el Ridge directo de un horizonte y proyecta desde el origen.

    La media y la desviación salen de los pares con objetivo ya conocido
    (``i + h <= origen``). El vector del propio origen se transforma con esas
    estadísticas y no entra en ellas.
    """
    historia = panel.iloc[: origen_iloc + 1]
    matriz, cambios, _indices = pares_directos(historia, columnas, horizonte)
    if len(cambios) < MIN_FILAS_RIDGE:
        raise ValueError(
            f"Solo hay {len(cambios)} pares para el horizonte {horizonte} en el origen {origen_iloc}."
        )
    escalador = StandardScaler()
    z_entrenamiento = escalador.fit_transform(matriz)
    modelo = Ridge(alpha=alpha, fit_intercept=True)
    modelo.fit(z_entrenamiento, cambios)
    x_origen = historia.iloc[[-1]][list(columnas)].to_numpy(dtype=float)
    if not np.isfinite(x_origen).all():
        raise ValueError("Las explicativas del origen no están completas.")
    cambio = float(modelo.predict(escalador.transform(x_origen))[0])
    nivel = float(historia["y"].iloc[-1] + cambio)
    coeficientes = {
        nombre: float(valor) for nombre, valor in zip(columnas, modelo.coef_, strict=True)
    }
    return AjusteRidge(
        horizonte=horizonte,
        columnas=tuple(columnas),
        coeficientes=coeficientes,
        intercepto=float(modelo.intercept_),
        media=np.asarray(escalador.mean_, dtype=float),
        desviacion=np.asarray(escalador.scale_, dtype=float),
        n=int(len(cambios)),
        cambio=cambio,
        nivel=nivel,
        alpha=float(alpha),
    )


class RidgeDirecto(ModeloBase):
    """Ridge directo por horizonte, con λ fijo sobre variables estandarizadas."""

    def __init__(
        self,
        id_modelo: str = "ridge_agregados",
        columnas: tuple[str, ...] = FEATURES_AGREGADOS,
        alpha: float = RIDGE_LAMBDA,
    ) -> None:
        super().__init__(id_modelo)
        self.columnas = columnas
        self.alpha = alpha

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        return {
            h: ajustar_ridge(panel, origen_iloc, h, self.columnas, self.alpha).nivel
            for h in horizontes
        }


class PaseoAleatorio(ModeloBase):
    """La tasa se queda en el último valor observado. Es la referencia."""

    def __init__(self) -> None:
        super().__init__("paseo_aleatorio")

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        tasa = float(panel["y"].iloc[origen_iloc])
        return {h: tasa for h in horizontes}


class _Iterativo(ModeloBase):
    """Base de los modelos que pueden fallar y volver a la tasa vigente."""

    def _puede_sustituir(self) -> bool:
        return True


class ModeloAR(_Iterativo):
    """AR sobre la tasa. El orden, entre 1 y 12, se elige por AIC en cada origen."""

    def __init__(self) -> None:
        super().__init__("ar")

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        tasa = pd.Series(panel["y"].iloc[: origen_iloc + 1].to_numpy(dtype=float))
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            seleccion = ar_select_order(tasa, maxlag=12, ic="aic", trend="c")
            rezagos = seleccion.ar_lags
            orden = 1 if not rezagos else int(max(rezagos))
            ajuste = AutoReg(tasa, lags=orden, trend="c").fit()
            futuro = ajuste.predict(start=len(tasa), end=len(tasa) + max(horizontes) - 1)
        valores = np.asarray(futuro, dtype=float)
        return {h: float(valores[h - 1]) for h in horizontes}


class ModeloSARIMAX(_Iterativo):
    """SARIMAX(1, 1, 0) con política y crecimiento de M2 rezagados un mes.

    El horizonte no usa dinero ni política futuros: las exógenas se mantienen
    en su último valor conocido. No se impone un término estacional; la prueba
    de dummies mensuales, en el informe, no lo justifica.
    """

    def __init__(self) -> None:
        super().__init__("sarimax")

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        historia = panel.iloc[: origen_iloc + 1]
        exogenas = pd.DataFrame(
            {
                "politica_rezagada": historia["pol"].shift(1),
                "m2_rezagado": historia["g_m2"].shift(1),
            }
        )
        datos = pd.concat([historia["y"].rename("y"), exogenas], axis=1).dropna()
        y = datos["y"].to_numpy(dtype=float)
        x = datos[["politica_rezagada", "m2_rezagado"]].to_numpy(dtype=float)
        h_max = max(horizontes)
        futuro = np.repeat(x[-1:], h_max, axis=0)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            modelo = SARIMAX(
                y,
                exog=x,
                order=(1, 1, 0),
                trend="c",
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            ajuste = modelo.fit(disp=False, maxiter=60, method="lbfgs")
            pronostico = np.asarray(ajuste.forecast(h_max, exog=futuro), dtype=float)
        return {h: float(pronostico[h - 1]) for h in horizontes}


class ModeloVAR(_Iterativo):
    """VAR de la variación de la tasa, la variación de la política y g(M2).

    El orden sale del AIC en cada origen, con un máximo de 4 rezagos. El nivel
    de la tasa se recupera acumulando las variaciones pronosticadas. No se
    alimenta con valores futuros de los agregados.
    """

    def __init__(self) -> None:
        super().__init__("var")

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        historia = panel.iloc[: origen_iloc + 1][["y", "pol", "g_m2"]].copy()
        historia["dy"] = historia["y"].diff()
        historia["dpol"] = historia["pol"].diff()
        endogenas = historia[["dy", "dpol", "g_m2"]].dropna()
        if len(endogenas) < 40:
            raise ValueError("Historia insuficiente para el VAR.")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            modelo = VAR(endogenas)
            orden = int(modelo.select_order(maxlags=4).selected_orders["aic"] or 1)
            orden = max(orden, 1)
            ajuste = modelo.fit(orden)
            pronostico = np.asarray(
                ajuste.forecast(endogenas.to_numpy(dtype=float)[-orden:], steps=max(horizontes)),
                dtype=float,
            )
        nivel = float(historia["y"].iloc[-1]) + np.cumsum(pronostico[:, 0])
        return {h: float(nivel[h - 1]) for h in horizontes}


class ModeloVECM(_Iterativo):
    """VECM de rango 1 entre la tasa de consumo y la tasa de política.

    Johansen no rechaza la ausencia de cointegración al 5 % en esta muestra.
    El VECM se conserva como contraste y el informe lo presenta así, no como
    el modelo mantenido.
    """

    def __init__(self) -> None:
        super().__init__("vecm")

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        endogenas = panel.iloc[: origen_iloc + 1][["y", "pol"]].dropna()
        if len(endogenas) < 40:
            raise ValueError("Historia insuficiente para el VECM.")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            modelo = VECM(endogenas, k_ar_diff=1, coint_rank=1, deterministic="ci")
            ajuste = modelo.fit()
            pronostico = np.asarray(ajuste.predict(steps=max(horizontes)), dtype=float)
        return {h: float(pronostico[h - 1, 0]) for h in horizontes}


def _mejor_alpha(
    x_temprano: np.ndarray,
    y_temprano: np.ndarray,
    x_reciente: np.ndarray,
    y_reciente: np.ndarray,
    razon_l1: float,
) -> float:
    """Elige λ en una rejilla con el bloque reciente del propio entrenamiento."""
    escalador = StandardScaler().fit(x_temprano)
    z_temprano = escalador.transform(x_temprano)
    z_reciente = escalador.transform(x_reciente)
    mejor_alpha = 0.1
    mejor_error = math_inf()
    for alpha in np.logspace(-3, 1, 12):
        modelo = ElasticNet(
            alpha=float(alpha),
            l1_ratio=razon_l1,
            fit_intercept=True,
            max_iter=8000,
            random_state=42,
        )
        modelo.fit(z_temprano, y_temprano)
        pronostico = modelo.predict(z_reciente)
        error = float(np.sqrt(np.mean((pronostico - y_reciente) ** 2)))
        if error < mejor_error:
            mejor_error = error
            mejor_alpha = float(alpha)
    return mejor_alpha


def math_inf() -> float:
    return float("inf")


class ModeloPenalizado(ModeloBase):
    """Lasso o Elastic Net directo. λ se elige con validación temporal."""

    def __init__(self, id_modelo: str, razon_l1: float) -> None:
        super().__init__(id_modelo)
        self.razon_l1 = razon_l1
        self.columnas = FEATURES_AGREGADOS

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        niveles: dict[int, float] = {}
        historia = panel.iloc[: origen_iloc + 1]
        x_origen = historia.iloc[[-1]][list(self.columnas)].to_numpy(dtype=float)
        tasa = float(historia["y"].iloc[-1])
        for horizonte in horizontes:
            matriz, cambios, _ = pares_directos(historia, self.columnas, horizonte)
            if len(cambios) < MIN_FILAS_RIDGE + 12:
                raise ValueError("Historia corta para validar λ.")
            n_validacion = min(24, max(12, len(cambios) // 5))
            corte = len(cambios) - n_validacion
            alpha = _mejor_alpha(
                matriz[:corte],
                cambios[:corte],
                matriz[corte:],
                cambios[corte:],
                self.razon_l1,
            )
            escalador = StandardScaler().fit(matriz)
            modelo = ElasticNet(
                alpha=alpha,
                l1_ratio=self.razon_l1,
                fit_intercept=True,
                max_iter=8000,
                random_state=42,
            )
            modelo.fit(escalador.transform(matriz), cambios)
            cambio = float(modelo.predict(escalador.transform(x_origen))[0])
            niveles[horizonte] = tasa + cambio
        return niveles


class ModeloPCARidge(ModeloBase):
    """Un componente de los tres crecimientos, más tasa y política, con Ridge λ = 5.

    El componente se estima solo con las filas de entrenamiento de ese origen.
    Sirve para ver si la colinealidad de M1, M2 y M3 se puede resumir sin perder
    el aporte predictivo.
    """

    def __init__(self) -> None:
        super().__init__("pca_ridge")

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        columnas = FEATURES_AGREGADOS
        historia = panel.iloc[: origen_iloc + 1]
        x_origen = historia.iloc[[-1]][list(columnas)].to_numpy(dtype=float)
        tasa = float(historia["y"].iloc[-1])
        niveles: dict[int, float] = {}
        for horizonte in horizontes:
            matriz, cambios, _ = pares_directos(historia, columnas, horizonte)
            base = matriz[:, :3]
            dinero = matriz[:, 3:]
            escalador_dinero = StandardScaler().fit(dinero)
            componente = PCA(n_components=1, random_state=42)
            factor = componente.fit_transform(escalador_dinero.transform(dinero))
            diseno = np.column_stack([base, factor])
            escalador = StandardScaler().fit(diseno)
            modelo = Ridge(alpha=RIDGE_LAMBDA, fit_intercept=True)
            modelo.fit(escalador.transform(diseno), cambios)
            factor_origen = componente.transform(escalador_dinero.transform(x_origen[:, 3:]))
            diseno_origen = np.column_stack([x_origen[:, :3], factor_origen])
            cambio = float(modelo.predict(escalador.transform(diseno_origen))[0])
            niveles[horizonte] = tasa + cambio
        return niveles


class ModeloGradiente(ModeloBase):
    """Potenciación de gradiente directa sobre las mismas seis variables.

    Profundidad 2, 80 árboles y tasa de aprendizaje 0,05 quedaron fijos antes
    de mirar el error de evaluación. No hay búsqueda aleatoria de hiperparámetros.
    """

    def __init__(self) -> None:
        super().__init__("gradiente")

    def _proyectar(
        self,
        panel: pd.DataFrame,
        origen_iloc: int,
        horizontes: list[int],
    ) -> dict[int, float]:
        historia = panel.iloc[: origen_iloc + 1]
        x_origen = historia.iloc[[-1]][list(FEATURES_AGREGADOS)].to_numpy(dtype=float)
        tasa = float(historia["y"].iloc[-1])
        niveles: dict[int, float] = {}
        for horizonte in horizontes:
            matriz, cambios, _ = pares_directos(historia, FEATURES_AGREGADOS, horizonte)
            modelo = GradientBoostingRegressor(
                n_estimators=80,
                learning_rate=0.05,
                max_depth=2,
                min_samples_leaf=5,
                subsample=1.0,
                random_state=42,
            )
            modelo.fit(matriz, cambios)
            niveles[horizonte] = tasa + float(modelo.predict(x_origen)[0])
        return niveles


def modelos_comparacion() -> list[ModeloBase]:
    """Todos los modelos del mismo backtest, en el orden del informe."""
    return [
        RidgeDirecto("ridge_agregados", FEATURES_AGREGADOS),
        RidgeDirecto("ridge_tasa_politica", FEATURES_TASA_POLITICA),
        PaseoAleatorio(),
        ModeloAR(),
        ModeloSARIMAX(),
        ModeloVAR(),
        ModeloVECM(),
        ModeloPenalizado("elastic_net", razon_l1=0.5),
        ModeloPenalizado("lasso", razon_l1=1.0),
        ModeloPCARidge(),
        ModeloGradiente(),
        RidgeDirecto("ridge_inflacion", FEATURES_AGREGADOS + ("inflacion",)),
        RidgeDirecto("ridge_brecha", FEATURES_AGREGADOS + ("brecha_inflacion",)),
    ]


def modelos_por_id() -> dict[str, ModeloBase]:
    """Índice de modelos por su identificador."""
    return {modelo.id: modelo for modelo in modelos_comparacion()}
