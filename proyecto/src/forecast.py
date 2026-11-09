"""Proyección desde el cierre de la muestra y escenario de condiciones iniciales.

El escenario no es estructural. Cambia el spread, la variación de la política o
el crecimiento de M2 en el mes de origen y vuelve a evaluar el Ridge directo ya
especificado. No inventa una senda futura de las explicativas ni reestima con
datos que no existen.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.config import COLUMNAS_PROYECCION, FEATURES_AGREGADOS, HORIZONTE_MAX
from src.intervals import aplicar_banda, cuantiles_residual
from src.models import ModeloBase, RidgeDirecto


def _fecha_objetivo(origen: pd.Timestamp, horizonte: int) -> pd.Timestamp:
    desplazada = origen + pd.DateOffset(months=int(horizonte))
    return desplazada.to_period("M").to_timestamp(how="end").normalize()


def construir_proyeccion(
    panel: pd.DataFrame,
    modelo: ModeloBase,
    errores: pd.DataFrame,
    horizontes: tuple[int, ...] = tuple(range(1, HORIZONTE_MAX + 1)),
) -> pd.DataFrame:
    """Senda puntual y bandas para los meses posteriores al último cierre."""
    origen = len(panel) - 1
    niveles = modelo.proyectar(panel, origen, list(horizontes))
    propios = errores.loc[errores["modelo"] == modelo.id]
    filas: list[dict[str, object]] = []
    for horizonte in horizontes:
        grupo = propios.loc[propios["horizonte"] == horizonte, "error"].to_numpy(dtype=float)
        nivel = float(niveles[horizonte])
        banda = aplicar_banda(nivel, cuantiles_residual(grupo))
        filas.append(
            {
                "modelo": modelo.id,
                "horizonte": int(horizonte),
                "fecha": _fecha_objetivo(panel.index[origen], horizonte),
                "proyeccion": nivel,
                "rmse_historico": float(np.sqrt(np.mean(grupo**2))),
                "mae_historico": float(np.mean(np.abs(grupo))),
                **banda,
            }
        )
    tabla = pd.DataFrame(filas)
    return tabla.loc[:, list(COLUMNAS_PROYECCION)]


def panel_escenario(
    panel: pd.DataFrame,
    delta_politica_pb: float = 0.0,
    crecimiento_m2: float | None = None,
) -> pd.DataFrame:
    """Copia el panel y modifica solo las condiciones del último mes."""
    salida = panel.copy()
    delta_pp = float(delta_politica_pb) / 100.0
    ultimo = salida.index[-1]
    salida.loc[ultimo, "pol"] = float(salida.loc[ultimo, "pol"]) + delta_pp
    salida.loc[ultimo, "spread"] = float(salida.loc[ultimo, "spread"]) - delta_pp
    salida.loc[ultimo, "dpol3"] = float(salida.loc[ultimo, "dpol3"]) + delta_pp
    if crecimiento_m2 is not None:
        salida.loc[ultimo, "g_m2"] = float(crecimiento_m2)
    return salida


def proyectar_escenario(
    panel: pd.DataFrame,
    delta_politica_pb: float = 0.0,
    crecimiento_m2: float | None = None,
    horizontes: tuple[int, ...] = tuple(range(1, HORIZONTE_MAX + 1)),
) -> dict[int, float]:
    """Proyección del Ridge con agregados bajo un choque de condiciones iniciales."""
    modificado = panel_escenario(panel, delta_politica_pb, crecimiento_m2)
    modelo = RidgeDirecto("ridge_agregados", FEATURES_AGREGADOS)
    return modelo.proyectar(modificado, len(modificado) - 1, list(horizontes))
