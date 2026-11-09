"""Carga de los CSV del Banco de la República y panel mensual de modelado.

La frecuencia de trabajo es mensual. La tasa de consumo, observada los viernes,
y la tasa de política, observada cada día, se llevan a promedio del mes calendario
y se fechan al cierre de ese mes. Los agregados, la inflación y el IPC ya vienen
en cierre de mes. Octubre de 2026 queda fuera del panel: la tasa solo tiene
viernes parciales y los agregados mensuales todavía no cierran.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.config import (
    ARCHIVO_AGREGADOS_MENSUAL,
    ARCHIVO_AGREGADOS_SEMANAL,
    ARCHIVO_INFLACION,
    ARCHIVO_IPC,
    ARCHIVO_POLITICA,
    ARCHIVO_TASAS,
    COL_BASE,
    COL_BASE_SEMANAL,
    COL_CONSUMO,
    COL_INFLACION,
    COL_IPC,
    COL_M1,
    COL_M1_SEMANAL,
    COL_M2,
    COL_M2_SEMANAL,
    COL_M3,
    COL_M3_SEMANAL,
    COL_META,
    COL_POLITICA,
    DATOS_CRUDOS,
    FIN_MUESTRA,
    FORMATO_FECHA,
    INICIO_MUESTRA,
    MES_PARCIAL,
    N_OBSERVACIONES,
)


def leer_csv(ruta: Path | str) -> pd.DataFrame:
    """Lee un CSV con separador ``;``, decimal ``,`` y BOM de Excel.

    La primera columna se interpreta como fecha ``AAAA/MM/DD`` y pasa a ser
    el índice, ordenado y sin duplicados.
    """
    tabla = pd.read_csv(ruta, sep=";", decimal=",", encoding="utf-8-sig")
    if tabla.empty:
        raise ValueError(f"El archivo {ruta} está vacío.")
    columna_fecha = tabla.columns[0]
    if str(columna_fecha).startswith("\ufeff"):
        raise ValueError(f"El BOM quedó pegado al nombre de columna en {ruta}.")
    fechas = pd.to_datetime(tabla[columna_fecha], format=FORMATO_FECHA, errors="coerce")
    if fechas.isna().any():
        raise ValueError(f"Hay fechas ilegibles en {ruta}.")
    salida = tabla.drop(columns=[columna_fecha]).copy()
    salida.index = pd.DatetimeIndex(fechas, name="fecha")
    salida = salida.sort_index()
    if salida.index.has_duplicates:
        raise ValueError(f"Hay fechas duplicadas en {ruta}.")
    return salida


def _fin_de_mes(serie: pd.Series, agregacion: str) -> pd.Series:
    """Agrega una serie a cierre de mes.

    ``agregacion`` es ``mean`` para tasas y ``last`` para saldos que ya están
    expresados en un día de referencia.
    """
    if agregacion == "mean":
        mensual = serie.resample("ME").mean()
    elif agregacion == "last":
        mensual = serie.resample("ME").last()
    else:
        raise ValueError(f"Agregación no reconocida: {agregacion}.")
    mensual.index = pd.DatetimeIndex(mensual.index).to_period("M").to_timestamp(how="end").normalize()
    mensual.index.name = "fecha"
    return mensual


def _recorte(serie: pd.Series, inicio: str, fin: str) -> pd.Series:
    periodo = serie.copy()
    periodo.index = pd.DatetimeIndex(periodo.index).to_period("M").to_timestamp(how="end").normalize()
    return periodo.loc[inicio:fin]


def construir_base(
    directorio: Path | str | None = None,
    inicio: str = INICIO_MUESTRA,
    fin: str = FIN_MUESTRA,
) -> pd.DataFrame:
    """Arma el panel mensual de niveles, sin transformaciones.

    Cada fila es un cierre de mes entre mayo de 2002 y septiembre de 2026.
    """
    crudo = Path(directorio) if directorio is not None else DATOS_CRUDOS
    tasas = leer_csv(crudo / ARCHIVO_TASAS)
    politica = leer_csv(crudo / ARCHIVO_POLITICA)
    agregados = leer_csv(crudo / ARCHIVO_AGREGADOS_MENSUAL)
    inflacion = leer_csv(crudo / ARCHIVO_INFLACION)
    ipc = leer_csv(crudo / ARCHIVO_IPC)

    consumo = _recorte(_fin_de_mes(tasas[COL_CONSUMO], "mean"), inicio, fin)
    politica_m = _recorte(_fin_de_mes(politica[COL_POLITICA], "mean"), inicio, fin)
    dinero = agregados[[COL_BASE, COL_M1, COL_M2, COL_M3]].apply(
        lambda columna: _recorte(_fin_de_mes(columna, "last"), inicio, fin)
    )
    precios = pd.DataFrame(
        {
            "inflacion": _recorte(_fin_de_mes(inflacion[COL_INFLACION], "last"), inicio, fin),
            "meta": _recorte(_fin_de_mes(inflacion[COL_META], "last"), inicio, fin),
            "ipc": _recorte(_fin_de_mes(ipc[COL_IPC], "last"), inicio, fin),
        }
    )
    panel = pd.concat(
        [
            consumo.rename("y"),
            politica_m.rename("pol"),
            dinero.rename(columns={COL_BASE: "base", COL_M1: "m1", COL_M2: "m2", COL_M3: "m3"}),
            precios,
        ],
        axis=1,
    )
    panel.index = pd.DatetimeIndex(panel.index, name="fecha")
    panel = panel.sort_index()
    esperado = pd.date_range(panel.index.min(), panel.index.max(), freq="ME")
    esperado = pd.DatetimeIndex(esperado).to_period("M").to_timestamp(how="end").normalize()
    panel = panel.reindex(esperado)
    if inicio == INICIO_MUESTRA and fin == FIN_MUESTRA:
        if len(panel) != N_OBSERVACIONES or panel.index.max() != pd.Timestamp("2026-09-30"):
            raise ValueError(
                f"Se esperaban {N_OBSERVACIONES} meses hasta septiembre de 2026 y hay {len(panel)}."
            )
        if panel.isna().any().any():
            faltantes = panel.isna().sum().to_dict()
            raise ValueError(f"El panel de modelado tiene huecos: {faltantes}.")
    return panel


def observacion_parcial(directorio: Path | str | None = None) -> dict[str, Any]:
    """Resume octubre de 2026, que no entra al entrenamiento.

    El promedio de la tasa usa solo los viernes ya publicados. No es un cierre.
    """
    crudo = Path(directorio) if directorio is not None else DATOS_CRUDOS
    tasas = leer_csv(crudo / ARCHIVO_TASAS)
    politica = leer_csv(crudo / ARCHIVO_POLITICA)
    mes = pd.Period(MES_PARCIAL, freq="M")
    tasas_mes = tasas.loc[tasas.index.to_period("M") == mes, COL_CONSUMO]
    politica_mes = politica.loc[politica.index.to_period("M") == mes, COL_POLITICA]
    return {
        "mes": str(mes),
        "tasa_promedio": float(tasas_mes.mean()) if len(tasas_mes) else None,
        "n_viernes": int(len(tasas_mes)),
        "primer_viernes": tasas_mes.index.min().date().isoformat() if len(tasas_mes) else None,
        "ultimo_viernes": tasas_mes.index.max().date().isoformat() if len(tasas_mes) else None,
        "politica_promedio": float(politica_mes.mean()) if len(politica_mes) else None,
        "n_dias_politica": int(len(politica_mes)),
        "uso": "Solo contraste. No entra al entrenamiento ni a la proyección.",
    }


def _huecos_dias(indice: pd.DatetimeIndex, paso_esperado: int) -> list[str]:
    if len(indice) < 2:
        return []
    diferencias = indice.to_series().diff().dt.days.iloc[1:]
    fechas = indice[1:][diferencias.to_numpy() != paso_esperado]
    return [fecha.date().isoformat() for fecha in fechas]


def _atipicos_cambio(serie: pd.Series, umbral: float = 3.5) -> list[dict[str, float | str]]:
    """Marca cambios mensuales con puntuación robusta alta. No los elimina."""
    cambio = serie.diff()
    desviacion = (cambio - cambio.median()).abs().median()
    escala = 1.4826 * desviacion
    if not np.isfinite(escala) or escala == 0:
        return []
    puntuacion = (cambio - cambio.median()) / escala
    marcas = puntuacion[puntuacion.abs() > umbral].dropna()
    return [
        {
            "fecha": fecha.date().isoformat(),
            "cambio": float(cambio.loc[fecha]),
            "puntuacion_robusta": float(puntuacion.loc[fecha]),
        }
        for fecha in marcas.index
    ]


def evaluar_calidad(directorio: Path | str | None = None) -> dict[str, Any]:
    """Revisa duplicados, huecos, nulos, atípicos y la alineación del panel."""
    crudo = Path(directorio) if directorio is not None else DATOS_CRUDOS
    tasas = leer_csv(crudo / ARCHIVO_TASAS)
    politica = leer_csv(crudo / ARCHIVO_POLITICA)
    agregados = leer_csv(crudo / ARCHIVO_AGREGADOS_MENSUAL)
    semanales = leer_csv(crudo / ARCHIVO_AGREGADOS_SEMANAL)
    inflacion = leer_csv(crudo / ARCHIVO_INFLACION)
    ipc = leer_csv(crudo / ARCHIVO_IPC)
    panel = construir_base(crudo)

    calendario = pd.date_range(politica.index.min(), politica.index.max(), freq="D")
    dias_faltantes = calendario.difference(politica.index)

    meses_agregados = agregados.index.to_period("M")
    calendario_m = pd.period_range(meses_agregados.min(), meses_agregados.max(), freq="M")
    meses_faltantes = calendario_m.difference(meses_agregados)

    def resumen_serie(tabla: pd.DataFrame, nombre: str) -> dict[str, Any]:
        return {
            "nombre": nombre,
            "filas": int(len(tabla)),
            "inicio": tabla.index.min().date().isoformat(),
            "fin": tabla.index.max().date().isoformat(),
            "duplicados": int(tabla.index.duplicated().sum()),
            "nulos": {columna: int(tabla[columna].isna().sum()) for columna in tabla.columns},
        }

    nulos_panel = {columna: int(panel[columna].isna().sum()) for columna in panel.columns}
    return {
        "decision_frecuencia": (
            "El modelo se estima en frecuencia mensual. La tasa de consumo semanal "
            "(viernes) y la tasa de política diaria entran como promedio del mes "
            "calendario, fechado al cierre. Los agregados monetarios se toman en su "
            "cierre de mes. La extensión semanal de los agregados no se usa en el "
            "modelo principal."
        ),
        "muestra": {
            "inicio": panel.index.min().date().isoformat(),
            "fin": panel.index.max().date().isoformat(),
            "observaciones": int(len(panel)),
            "nulos": nulos_panel,
            "tasa_cierre": float(panel["y"].iloc[-1]),
            "politica_cierre": float(panel["pol"].iloc[-1]),
        },
        "tasas_semanales": {
            **resumen_serie(tasas, "Tasas de interés"),
            "viernes": int((tasas.index.day_of_week == 4).sum()),
            "huecos_distintos_de_7_dias": _huecos_dias(tasas.index, 7),
        },
        "politica_diaria": {
            **resumen_serie(politica, "Tasa de política"),
            "dias_faltantes": [fecha.date().isoformat() for fecha in dias_faltantes],
            "ultimo_valor": float(politica[COL_POLITICA].iloc[-1]),
        },
        "agregados_mensuales": {
            **resumen_serie(agregados, "Agregados mensuales"),
            "meses_faltantes": [str(mes) for mes in meses_faltantes],
        },
        "agregados_semanales": {
            **resumen_serie(semanales, "Agregados semanales"),
            "conteo_dia_semana": {
                str(dia): int(conteo)
                for dia, conteo in semanales.index.day_of_week.value_counts().sort_index().items()
            },
            "huecos_distintos_de_7_dias": _huecos_dias(semanales.index, 7)[:30],
            "n_huecos": len(_huecos_dias(semanales.index, 7)),
            "columnas": [COL_BASE_SEMANAL, COL_M1_SEMANAL, COL_M2_SEMANAL, COL_M3_SEMANAL],
        },
        "inflacion": resumen_serie(inflacion, "Inflación y meta"),
        "ipc": resumen_serie(ipc, "IPC"),
        "atipicos_cambio_tasa": _atipicos_cambio(panel["y"]),
        "atipicos_cambio_politica": _atipicos_cambio(panel["pol"]),
        "parcial_octubre_2026": observacion_parcial(crudo),
        "meta_nula_antes_de_1991": int(inflacion.loc[: "1990-12-31", COL_META].isna().sum()),
        "meta_nula_en_la_muestra": int(panel["meta"].isna().sum()),
    }
