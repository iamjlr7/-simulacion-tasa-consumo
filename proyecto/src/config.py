"""Constantes del estudio: rutas, columnas, muestra y referencia publicada."""

from __future__ import annotations

import math
from pathlib import Path

RAIZ: Path = Path(__file__).resolve().parents[1]
DATOS_CRUDOS: Path = RAIZ / "data" / "raw"
DATOS_PROCESADOS: Path = RAIZ / "data" / "processed"
TIENDA: Path = RAIZ.parent
MEDIA: Path = TIENDA / "media"
DOCS: Path = TIENDA / "docs"
INFORME: Path = DOCS / "informe-modelado.md"

ARCHIVO_TASAS = "Tasas_de_interes.csv"
ARCHIVO_POLITICA = "Tasas_de_politica_monetaria.csv"
ARCHIVO_AGREGADOS_MENSUAL = "Agregados_monetarios_y_crediticios_mensual.csv"
ARCHIVO_AGREGADOS_SEMANAL = "Agregados_monetarios_y_crediticios_semanal.csv"
ARCHIVO_INFLACION = "Inflacion_y_meta.csv"
ARCHIVO_IPC = "IPC.csv"

COL_CONSUMO = "Crédito de consumo, Tasa de interés, semanal"
COL_COLOCACION_BR = "Tasa de interés de colocación Banco de la República, semanal"
COL_COLOCACION_TOTAL = "Tasa de interés de colocación Total, semanal"
COL_COMERCIAL_ORDINARIO = "Créditos Comerciales (Ordinario), Tasa de interés, semanal"
COL_COMERCIAL_PREFERENCIAL = (
    "Créditos Comerciales (Preferencial o Corporativo), Tasa de interés, semanal"
)
COL_COMERCIAL_TESORERIA = "Créditos Comerciales (Tesorería), Tasa de interés, semanal"
COL_POLITICA = "Tasa de política monetaria"
COL_BASE = "Base monetaria, mensual"
COL_M1 = "M1, mensual"
COL_M2 = "M2, mensual"
COL_M3 = "M3, mensual"
COL_BASE_SEMANAL = "Base monetaria, semanal"
COL_M1_SEMANAL = "M1, semanal"
COL_M2_SEMANAL = "M2, semanal"
COL_M3_SEMANAL = "M3, semanal"
COL_META = "Meta de inflación"
COL_INFLACION = "Inflación total anual"
COL_IPC = "Índice de Precios al Consumidor (IPC)"

# Muestra común, limitada por la serie semanal de tasas.
INICIO_MUESTRA = "2002-05"
FIN_MUESTRA = "2026-09"
MES_PARCIAL = "2026-10"
N_OBSERVACIONES = 293
MIN_MESES_ENTRENAMIENTO = 120
PRIMERA_PREDICCION = "2012-05"
RIDGE_LAMBDA = 5.0
HORIZONTE_MAX = 24
HORIZONTES_REPORTE: tuple[int, ...] = (1, 3, 6, 12, 24)
HORIZONTES_BACKTEST: tuple[int, ...] = tuple(range(1, HORIZONTE_MAX + 1))
MIN_FILAS_RIDGE = 24
MIN_RESIDUOS_BANDA = 36
FORMATO_FECHA = "%Y/%m/%d"

# Variables del Ridge directo. El orden es el de la especificación.
FEATURES_AGREGADOS: tuple[str, ...] = (
    "dy3",
    "spread",
    "dpol3",
    "g_m1",
    "g_m2",
    "g_m3",
)
FEATURES_TASA_POLITICA: tuple[str, ...] = ("dy3", "spread", "dpol3")
ETIQUETA_FEATURE: dict[str, str] = {
    "dy3": "Variación a 3 meses de la tasa",
    "spread": "Spread frente a la política",
    "dpol3": "Variación a 3 meses de la política",
    "g_m1": "Crecimiento anual de M1",
    "g_m2": "Crecimiento anual de M2",
    "g_m3": "Crecimiento anual de M3",
    "inflacion": "Inflación total anual",
    "brecha_inflacion": "Brecha de inflación",
}

NOMBRES_MODELO: dict[str, str] = {
    "ridge_agregados": "Ridge con agregados",
    "ridge_tasa_politica": "Ridge solo tasa y política",
    "paseo_aleatorio": "Tasa constante",
    "ar": "Autorregresivo",
    "sarimax": "SARIMAX con exógenas rezagadas",
    "var": "VAR en diferencias",
    "vecm": "VECM tasa y política",
    "elastic_net": "Elastic Net",
    "lasso": "Lasso",
    "pca_ridge": "Componentes principales",
    "gradiente": "Potenciación de gradiente",
    "ridge_inflacion": "Ridge con inflación",
    "ridge_brecha": "Ridge con brecha de inflación",
}

# RMSE de referencia, en puntos porcentuales, redondeados a dos decimales
# en la fuente que se quiere reproducir.
RMSE_REFERENCIA: dict[str, dict[int, float]] = {
    "ridge_agregados": {1: 0.53, 3: 0.96, 6: 1.76, 12: 3.19},
    "ridge_tasa_politica": {1: 0.54, 3: 1.00, 6: 1.94, 12: 3.79},
    "paseo_aleatorio": {1: 0.61, 3: 1.27, 6: 2.28, 12: 3.93},
}
PROYECCION_REFERENCIA: dict[int, float] = {1: 21.53, 3: 22.04, 6: 22.94, 12: 23.84}
TASA_FINAL_REFERENCIA = 21.25
TOLERANCIA_RMSE = 0.05

REGIMENES: tuple[tuple[str, str, str], ...] = (
    ("2008-2009", "2008-01-01", "2009-12-31"),
    ("2015-2016", "2015-01-01", "2016-12-31"),
    ("2020-2021", "2020-01-01", "2021-12-31"),
    ("2022-2023", "2022-01-01", "2023-12-31"),
)

COLUMNAS_PROYECCION: tuple[str, ...] = (
    "modelo",
    "horizonte",
    "fecha",
    "proyeccion",
    "banda_80_inferior",
    "banda_80_superior",
    "banda_95_inferior",
    "banda_95_superior",
    "rmse_historico",
    "mae_historico",
)


def coma(valor: float | None, decimales: int = 2) -> str:
    """Formatea un número con coma decimal para textos en español."""
    if valor is None:
        return "—"
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return "—"
    if not math.isfinite(numero):
        return "—"
    return f"{numero:.{decimales}f}".replace(".", ",")
