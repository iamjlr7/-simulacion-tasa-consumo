"""Transformaciones y pares de entrenamiento sin información futura.

El crecimiento anual de cada agregado es ``100 * ln(M_t / M_{t-12})``.
La variación a tres meses de la tasa y de la política, el spread y la brecha
de inflación se calculan solo con rezagos ya observados. El armado de pares
para el horizonte ``h`` exige que el objetivo ``y_{i+h}`` caiga en el origen
o antes.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from src.config import FEATURES_AGREGADOS
from src.data_loader import cargar_externos, construir_base


def agregar_transformaciones(panel: pd.DataFrame) -> pd.DataFrame:
    """Añade spread, variaciones a tres meses, crecimientos y brecha."""
    salida = panel.copy()
    salida["dy3"] = salida["y"] - salida["y"].shift(3)
    salida["spread"] = salida["y"] - salida["pol"]
    salida["dpol3"] = salida["pol"] - salida["pol"].shift(3)
    for columna, nombre in (("m1", "g_m1"), ("m2", "g_m2"), ("m3", "g_m3"), ("base", "g_base")):
        salida[nombre] = 100.0 * np.log(salida[columna] / salida[columna].shift(12))
    salida["brecha_inflacion"] = salida["inflacion"] - salida["meta"]
    salida["inflacion_ipc"] = 100.0 * (salida["ipc"] / salida["ipc"].shift(12) - 1.0)
    salida["tasa_real"] = salida["pol"] - salida["inflacion"]
    if "trm" in salida:
        salida["g_trm"] = 100.0 * np.log(salida["trm"] / salida["trm"].shift(12))
        salida["dtrm3"] = 100.0 * np.log(salida["trm"] / salida["trm"].shift(3))
    if "fed" in salida:
        salida["dif_fed"] = salida["pol"] - salida["fed"]
        salida["dfed3"] = salida["fed"] - salida["fed"].shift(3)
    if "usura" in salida:
        salida["holgura_usura"] = salida["usura"] - salida["y"]
    return salida


def cargar_panel(directorio: Path | str | None = None) -> pd.DataFrame:
    """Devuelve el panel de modelado, con transformaciones y sin octubre de 2026.

    A los niveles del Banco de la República se les unen la TRM, la tasa de la
    Reserva Federal y la usura cuando la carpeta ``externos`` está presente.
    """
    base = construir_base(directorio)
    externos = cargar_externos(base.index, None if directorio is None else Path(directorio) / "externos")
    return agregar_transformaciones(base.join(externos))


def pares_directos(
    historia: pd.DataFrame,
    columnas: tuple[str, ...] | list[str],
    horizonte: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Pares ``(x_i, y_{i+h} - y_i)`` contenidos en ``historia``.

    ``historia`` debe terminar en el origen del pronóstico. El último índice
    de entrenamiento cumple ``i + h`` igual al último renglón cuando ese
    renglón tiene datos finitos: el origen entra como objetivo de un par viejo,
    no como fila de entrenamiento del escalado.
    """
    if horizonte < 1:
        raise ValueError("El horizonte tiene que ser un entero mayor o igual que 1.")
    nombres = list(columnas)
    matriz = historia.loc[:, nombres].to_numpy(dtype=float)
    tasa = historia["y"].to_numpy(dtype=float)
    n_filas = len(historia)
    indices: list[int] = []
    for i in range(n_filas - horizonte):
        objetivo_observado = np.isfinite(tasa[i]) and np.isfinite(tasa[i + horizonte])
        if objetivo_observado and np.isfinite(matriz[i]).all():
            indices.append(i)
    if not indices:
        vacio_x = np.empty((0, len(nombres)), dtype=float)
        return vacio_x, np.empty(0, dtype=float), np.empty(0, dtype=int)
    idx = np.asarray(indices, dtype=int)
    return matriz[idx], tasa[idx + horizonte] - tasa[idx], idx


def escalar_entrenamiento(matriz: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Estandariza con la media y la desviación poblacional de ``matriz``.

    Esas estadísticas tienen que calcularse solo con filas de entrenamiento.
    Una desviación nula se reemplaza por 1 para no dividir entre cero.
    """
    if matriz.ndim != 2 or len(matriz) == 0:
        raise ValueError("No hay filas para escalar.")
    media = matriz.mean(axis=0)
    desviacion = matriz.std(axis=0, ddof=0)
    desviacion = np.where(desviacion < 1e-12, 1.0, desviacion)
    return (matriz - media) / desviacion, media, desviacion


def columnas_validas(panel: pd.DataFrame, columnas: tuple[str, ...] = FEATURES_AGREGADOS) -> pd.Series:
    """Máscara de meses en los que todas las explicativas son finitas."""
    return panel.loc[:, list(columnas)].notna().all(axis=1)
