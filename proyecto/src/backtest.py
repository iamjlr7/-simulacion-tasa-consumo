"""Ventana expansiva, métricas y prueba de Diebold-Mariano.

El primer origen es abril de 2012: hay 120 meses de historia, de mayo de 2002
a ese mes. La primera tasa que se pronostica a un mes es la de mayo de 2012.
En el origen ``t`` solo se usan pares cuyo objetivo cae en ``t`` o antes.
El reajuste es mensual.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy import stats

from src.config import HORIZONTES_BACKTEST, MIN_MESES_ENTRENAMIENTO
from src.models import ModeloBase


def correr_backtest(
    panel: pd.DataFrame,
    modelos: list[ModeloBase],
    horizontes: tuple[int, ...] = HORIZONTES_BACKTEST,
    min_meses: int = MIN_MESES_ENTRENAMIENTO,
) -> pd.DataFrame:
    """Pronostica cada mes, desde el primer origen con ``min_meses`` de historia."""
    n = len(panel)
    primero = min_meses - 1
    if primero < 0 or primero >= n:
        raise ValueError("La ventana mínima de entrenamiento no cabe en el panel.")
    filas: list[dict[str, object]] = []
    for modelo in modelos:
        for origen in range(primero, n - 1):
            if origen == primero or (origen - primero) % 50 == 0:
                print(f"    {modelo.id}: origen {origen} de {n - 2}", flush=True)
            hs = [h for h in horizontes if origen + h < n]
            if not hs:
                continue
            pronosticos = modelo.proyectar(panel, origen, hs)
            tasa_origen = float(panel["y"].iloc[origen])
            for horizonte in hs:
                nivel = float(pronosticos[horizonte])
                real = float(panel["y"].iloc[origen + horizonte])
                filas.append(
                    {
                        "modelo": modelo.id,
                        "origen": panel.index[origen],
                        "origen_iloc": origen,
                        "horizonte": int(horizonte),
                        "fecha_objetivo": panel.index[origen + horizonte],
                        "y_origen": tasa_origen,
                        "y_pronostico": nivel,
                        "y_real": real,
                        "error": real - nivel,
                    }
                )
    if not filas:
        raise ValueError("El backtest no produjo pronósticos.")
    return pd.DataFrame(filas)


def denominador_mase(panel: pd.DataFrame, min_meses: int = MIN_MESES_ENTRENAMIENTO) -> float:
    """Escala de Hyndman con el paseo de un mes, medida antes de la evaluación.

    Usa los cambios absolutos de la tasa desde mayo de 2002 hasta el primer
    origen (abril de 2012). El mismo denominador sirve para todos los horizontes.
    """
    primero = min_meses - 1
    cambios = np.diff(panel["y"].iloc[: primero + 1].to_numpy(dtype=float))
    escala = float(np.mean(np.abs(cambios)))
    if not math.isfinite(escala) or escala <= 0:
        raise ValueError("No se pudo calcular el denominador del MASE.")
    return escala


def diebold_mariano(
    error_modelo: np.ndarray,
    error_referencia: np.ndarray,
    horizonte: int,
) -> tuple[float, float]:
    """Estadístico HLN y valor p de una prueba bilateral con pérdida cuadrática.

    Un estadístico negativo indica que el modelo tiene menor error cuadrático
    que la referencia. La varianza es Newey-West con ``h - 1`` rezagos y el
    estadístico lleva el ajuste de Harvey, Leybourne y Newbold.
    """
    d = np.asarray(error_modelo, dtype=float) ** 2 - np.asarray(error_referencia, dtype=float) ** 2
    d = d[np.isfinite(d)]
    n = len(d)
    if n <= horizonte + 2:
        return math.nan, math.nan
    media = float(d.mean())
    rezagos = max(int(horizonte) - 1, 0)
    gamma0 = float(np.mean((d - media) ** 2))
    varianza = gamma0
    for rezago in range(1, rezagos + 1):
        peso = 1.0 - rezago / (rezagos + 1.0)
        covarianza = float(np.mean((d[rezago:] - media) * (d[:-rezago] - media)))
        varianza += 2.0 * peso * covarianza
    varianza = max(varianza, 1e-12)
    estadistico = media / math.sqrt(varianza / n)
    factor = math.sqrt((n + 1 - 2 * horizonte + horizonte * (horizonte - 1) / n) / n)
    ajustado = estadistico * factor
    valor_p = float(2 * (1 - stats.norm.cdf(abs(ajustado))))
    return float(ajustado), valor_p


def calcular_metricas(
    predicciones: pd.DataFrame,
    panel: pd.DataFrame,
    id_referencia: str = "paseo_aleatorio",
    min_meses: int = MIN_MESES_ENTRENAMIENTO,
) -> pd.DataFrame:
    """RMSE, MAE, MASE, sesgo, razón frente al paseo y Diebold-Mariano."""
    escala = denominador_mase(panel, min_meses)
    referencia = predicciones.loc[predicciones["modelo"] == id_referencia].copy()
    filas: list[dict[str, float | int | str]] = []
    for (modelo, horizonte), grupo in predicciones.groupby(["modelo", "horizonte"], sort=False):
        errores = grupo["error"].to_numpy(dtype=float)
        rmse = float(np.sqrt(np.mean(errores**2)))
        mae = float(np.mean(np.abs(errores)))
        base = referencia.loc[referencia["horizonte"] == horizonte, ["fecha_objetivo", "error", "y_real", "y_pronostico"]]
        fusion = grupo.merge(base, on="fecha_objetivo", suffixes=("", "_ref"))
        if len(fusion) == 0 or modelo == id_referencia:
            razon = 1.0 if modelo == id_referencia else math.nan
            dm, valor_p = (math.nan, math.nan)
            rmse_ref = rmse if modelo == id_referencia else math.nan
        else:
            rmse_ref = float(np.sqrt(np.mean(fusion["error_ref"].to_numpy(dtype=float) ** 2)))
            razon = rmse / rmse_ref if rmse_ref > 0 else math.nan
            dm, valor_p = diebold_mariano(
                fusion["error"].to_numpy(dtype=float),
                fusion["error_ref"].to_numpy(dtype=float),
                int(horizonte),
            )
        filas.append(
            {
                "modelo": str(modelo),
                "horizonte": int(horizonte),
                "n": int(len(grupo)),
                "rmse": rmse,
                "mae": mae,
                "mase": mae / escala,
                "sesgo": float(np.mean(errores)),
                "rmse_paseo": float(rmse_ref) if math.isfinite(rmse_ref) else math.nan,
                "razon_rmse_paseo": float(razon) if math.isfinite(razon) else math.nan,
                "dm_stat": dm,
                "dm_pvalue": valor_p,
                "mase_escala": escala,
            }
        )
    return pd.DataFrame(filas)


def metricas_por_regimen(predicciones: pd.DataFrame, inicio: str, fin: str) -> pd.DataFrame:
    """RMSE y MAE de los meses objetivo que caen en el régimen."""
    mascara = (predicciones["fecha_objetivo"] >= inicio) & (predicciones["fecha_objetivo"] <= fin)
    recorte = predicciones.loc[mascara]
    filas: list[dict[str, float | int | str]] = []
    if recorte.empty:
        return pd.DataFrame(filas)
    for (modelo, horizonte), grupo in recorte.groupby(["modelo", "horizonte"], sort=False):
        errores = grupo["error"].to_numpy(dtype=float)
        filas.append(
            {
                "modelo": str(modelo),
                "horizonte": int(horizonte),
                "n": int(len(grupo)),
                "rmse": float(np.sqrt(np.mean(errores**2))),
                "mae": float(np.mean(np.abs(errores))),
                "sesgo": float(np.mean(errores)),
            }
        )
    return pd.DataFrame(filas)
