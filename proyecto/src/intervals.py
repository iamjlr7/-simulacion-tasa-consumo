"""Bandas a partir de los errores ya realizados del backtest.

El residual es ``tasa realizada − pronóstico``. La banda de un origen usa solo
residuales cuyo mes objetivo ya ocurrió en ese origen. Con eso, la cobertura
que se reporta no mira errores que todavía no se conocían. En septiembre de
2026 todos los residuales del backtest ya son pasado, y con ellos se construye
la banda de la proyección publicada.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.config import MIN_RESIDUOS_BANDA


def cuantiles_residual(residuales: np.ndarray) -> dict[str, float]:
    """Cuantiles empíricos 10, 90, 2,5 y 97,5 de los residuales."""
    valores = np.asarray(residuales, dtype=float)
    valores = valores[np.isfinite(valores)]
    if len(valores) < 5:
        raise ValueError("No hay residuales suficientes para una banda.")
    bajo80, alto80, bajo95, alto95 = np.quantile(valores, [0.10, 0.90, 0.025, 0.975])
    return {
        "q10": float(bajo80),
        "q90": float(alto80),
        "q025": float(bajo95),
        "q975": float(alto95),
    }


def aplicar_banda(pronostico: float, cuantiles: dict[str, float]) -> dict[str, float]:
    """Suma los cuantiles del residual al pronóstico puntual."""
    return {
        "banda_80_inferior": float(pronostico + cuantiles["q10"]),
        "banda_80_superior": float(pronostico + cuantiles["q90"]),
        "banda_95_inferior": float(pronostico + cuantiles["q025"]),
        "banda_95_superior": float(pronostico + cuantiles["q975"]),
    }


def cobertura_expandida(
    predicciones: pd.DataFrame,
    minimo: int = MIN_RESIDUOS_BANDA,
) -> pd.DataFrame:
    """Cobertura empírica con bandas estimadas solo con el pasado de cada origen."""
    filas: list[dict[str, float | int | str]] = []
    for (modelo, horizonte), grupo in predicciones.groupby(["modelo", "horizonte"], sort=False):
        ordenado = grupo.sort_values("origen_iloc")
        acierto80: list[bool] = []
        acierto95: list[bool] = []
        origenes = ordenado["origen_iloc"].to_numpy()
        errores = ordenado["error"].to_numpy(dtype=float)
        pronosticos = ordenado["y_pronostico"].to_numpy(dtype=float)
        reales = ordenado["y_real"].to_numpy(dtype=float)
        for i, origen in enumerate(origenes):
            conocidos = errores[origenes + int(horizonte) <= origen]
            if len(conocidos) < minimo:
                continue
            cuantiles = cuantiles_residual(conocidos)
            banda = aplicar_banda(float(pronosticos[i]), cuantiles)
            real = float(reales[i])
            acierto80.append(banda["banda_80_inferior"] <= real <= banda["banda_80_superior"])
            acierto95.append(banda["banda_95_inferior"] <= real <= banda["banda_95_superior"])
        filas.append(
            {
                "modelo": str(modelo),
                "horizonte": int(horizonte),
                "n": int(len(acierto80)),
                "cobertura_80": float(np.mean(acierto80)) if acierto80 else np.nan,
                "cobertura_95": float(np.mean(acierto95)) if acierto95 else np.nan,
            }
        )
    return pd.DataFrame(filas)
