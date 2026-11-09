"""Pruebas de raíz unitaria, causalidad, cointegración y diagnóstico residual.

Las pruebas sobre toda la muestra describen la serie; no eligen el λ del Ridge
ni se usan para descartar modelos después de ver el error de evaluación. El
AIC del AR y del VAR, y la validación de λ del Lasso, se calculan dentro de
cada origen, en el módulo de modelos.
"""

from __future__ import annotations

import contextlib
import io
import warnings
from typing import Any

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.stats.diagnostic import acorr_ljungbox
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.stats.stattools import jarque_bera
from statsmodels.tsa.stattools import adfuller, coint, grangercausalitytests, kpss
from statsmodels.tsa.vector_ar.vecm import coint_johansen

from src.config import FEATURES_AGREGADOS


def _adf(serie: pd.Series, regresion: str) -> dict[str, float | int | str]:
    limpia = serie.dropna()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        estadistico, valor_p, rezagos, n, criticos, _ = adfuller(
            limpia, autolag="AIC", regression=regresion
        )
    return {
        "estadistico": float(estadistico),
        "valor_p": float(valor_p),
        "rezagos": int(rezagos),
        "n": int(n),
        "regresion": regresion,
        "critico_5": float(criticos["5%"]),
    }


def _kpss(serie: pd.Series, regresion: str) -> dict[str, float | int | str]:
    limpia = serie.dropna()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        estadistico, valor_p, rezagos, criticos = kpss(limpia, regression=regresion, nlags="auto")
    return {
        "estadistico": float(estadistico),
        "valor_p": float(valor_p),
        "rezagos": int(rezagos),
        "regresion": regresion,
        "critico_5": float(criticos["5%"]),
        "nota": "statsmodels recorta el valor p de KPSS al intervalo 0,01–0,10.",
    }


def _granger(datos: pd.DataFrame, causa: str, efecto: str = "dy") -> dict[str, float]:
    muestra = datos[[efecto, causa]].dropna()
    with contextlib.redirect_stdout(io.StringIO()):
        resultado = grangercausalitytests(muestra, maxlag=12)
    return {
        str(rezago): float(resultado[rezago][0]["ssr_ftest"][1]) for rezago in (3, 6, 12)
    }


def _johansen(datos: pd.DataFrame) -> dict[str, Any]:
    prueba = coint_johansen(datos, det_order=0, k_ar_diff=2)
    return {
        "variables": list(datos.columns),
        "traza": [float(valor) for valor in prueba.lr1],
        "critico_95": [float(valor) for valor in prueba.cvt[:, 1]],
        "rechaza_r0_al_5": bool(prueba.lr1[0] > prueba.cvt[0, 1]),
    }


def correlacion_cruzada(panel: pd.DataFrame, max_rezago: int = 12) -> dict[str, dict[str, float]]:
    """Correlación de la tasa en t con cada variable rezagada k meses, k = 0…12."""
    salida: dict[str, dict[str, float]] = {}
    for columna in ("g_m1", "g_m2", "g_m3", "pol", "m1", "m2", "m3"):
        salida[columna] = {}
        for rezago in range(max_rezago + 1):
            salida[columna][str(rezago)] = float(panel["y"].corr(panel[columna].shift(rezago)))
    return salida


def factores_inflacion_varianza(panel: pd.DataFrame) -> dict[str, float]:
    """VIF de las seis variables del Ridge, con constante, en la muestra común."""
    muestra = panel.loc[:, list(FEATURES_AGREGADOS)].dropna()
    diseno = sm.add_constant(muestra, has_constant="add")
    return {
        columna: float(variance_inflation_factor(diseno.to_numpy(dtype=float), i))
        for i, columna in enumerate(diseno.columns)
        if columna != "const"
    }


def prueba_estacionalidad(panel: pd.DataFrame) -> dict[str, float]:
    """Dummies de mes sobre el cambio de la tasa, solo hasta abril de 2012."""
    cambio = panel.loc[: "2012-04-30", "y"].diff().dropna()
    dummies = pd.get_dummies(cambio.index.month, prefix="mes", drop_first=True, dtype=float)
    dummies.index = cambio.index
    ajuste = sm.OLS(cambio.to_numpy(dtype=float), sm.add_constant(dummies)).fit()
    return {"valor_p": float(ajuste.f_pvalue), "n": float(ajuste.nobs)}


def diagnostico_residuales(errores: pd.Series) -> dict[str, float]:
    """Ljung-Box y Jarque-Bera de una serie de errores de un paso."""
    valores = errores.dropna().to_numpy(dtype=float)
    caja = acorr_ljungbox(valores, lags=[6, 12], return_df=True)
    estadistico, valor_p, asimetria, curtosis = jarque_bera(valores)
    return {
        "n": float(len(valores)),
        "ljung_box_6": float(caja.loc[6, "lb_pvalue"]),
        "ljung_box_12": float(caja.loc[12, "lb_pvalue"]),
        "jarque_bera": float(estadistico),
        "jarque_bera_p": float(valor_p),
        "asimetria": float(asimetria),
        "curtosis": float(curtosis),
    }


def ejecutar_pruebas(panel: pd.DataFrame) -> dict[str, Any]:
    """ADF, KPSS, Granger, Engle-Granger, Johansen, VIF y correlación cruzada."""
    trabajo = panel.copy()
    trabajo["dy"] = trabajo["y"].diff()
    trabajo["dpol"] = trabajo["pol"].diff()
    trabajo["l_m2"] = np.log(trabajo["m2"])
    for columna in ("m1", "m2", "m3", "base"):
        trabajo[f"d_{columna}"] = trabajo[columna].diff()

    especificacion = {
        "y": "c",
        "pol": "c",
        "dy": "c",
        "dpol": "c",
        "m1": "ct",
        "m2": "ct",
        "m3": "ct",
        "d_m1": "c",
        "d_m2": "c",
        "d_m3": "c",
        "g_m1": "c",
        "g_m2": "c",
        "g_m3": "c",
        "spread": "c",
        "inflacion": "c",
        "brecha_inflacion": "c",
    }
    raices: dict[str, dict[str, Any]] = {}
    for columna, regresion in especificacion.items():
        raices[columna] = {"adf": _adf(trabajo[columna], regresion), "kpss": _kpss(trabajo[columna], regresion)}

    previa = trabajo.loc[: "2012-04-30"]
    causas = ("g_m1", "g_m2", "g_m3", "dpol")
    granger = {
        "hasta_abril_2012": {causa: _granger(previa, causa) for causa in causas},
        "muestra_completa": {causa: _granger(trabajo, causa) for causa in causas},
    }
    engle = {}
    for nombre, otra in (("politica", trabajo["pol"]), ("log_m2", trabajo["l_m2"])):
        estadistico, valor_p, criticos = coint(trabajo["y"], otra, trend="c", autolag="aic")
        engle[nombre] = {
            "estadistico": float(estadistico),
            "valor_p": float(valor_p),
            "critico_5": float(criticos[1]),
        }
    return {
        "raices": raices,
        "granger": granger,
        "engle_granger": engle,
        "johansen_tasa_politica": _johansen(trabajo[["y", "pol"]].dropna()),
        "johansen_tasa_politica_logm2": _johansen(trabajo[["y", "pol", "l_m2"]].dropna()),
        "vif": factores_inflacion_varianza(trabajo),
        "correlacion_cruzada": correlacion_cruzada(trabajo),
        "estacionalidad_hasta_2012": prueba_estacionalidad(trabajo),
        "correlacion_features": trabajo.loc[:, list(FEATURES_AGREGADOS) + ["y", "inflacion"]]
        .corr()
        .round(6)
        .to_dict(),
    }
