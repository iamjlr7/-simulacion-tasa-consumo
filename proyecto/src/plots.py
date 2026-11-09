"""Gráficos estáticos del informe. Los textos y los ejes están en español."""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd

from src.config import HORIZONTES_REPORTE, NOMBRES_MODELO

AZUL = "#0B3A5B"
DORADO = "#A67C2D"
TEJA = "#9C4A2B"
VERDE = "#1F6F5B"
GRIS = "#5C6B73"
BANDA = "#8AA4B5"


def _estilo() -> None:
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "axes.titlesize": 13,
            "axes.labelsize": 11,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "grid.alpha": 0.25,
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "legend.frameon": False,
        }
    )


def _coma(decimales: int = 1) -> mticker.FuncFormatter:
    def _formato(valor: float, _posicion: int) -> str:
        return f"{valor:.{decimales}f}".replace(".", ",")

    return mticker.FuncFormatter(_formato)


def _guardar(figura: plt.Figure, ruta: Path) -> Path:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    figura.savefig(ruta, dpi=140, bbox_inches="tight")
    plt.close(figura)
    return ruta


def historia_tasas(panel: pd.DataFrame, ruta: Path) -> Path:
    """Tasa de consumo y tasa de política en la muestra de modelado."""
    _estilo()
    figura, eje = plt.subplots(figsize=(10.5, 5.2))
    eje.plot(panel.index, panel["y"], color=AZUL, lw=1.8, label="Crédito de consumo")
    eje.plot(panel.index, panel["pol"], color=DORADO, lw=1.6, label="Tasa de política")
    eje.set_title("Tasa de crédito de consumo y tasa de política")
    eje.set_ylabel("Porcentaje efectivo anual")
    eje.set_xlabel("Mes")
    eje.yaxis.set_major_formatter(_coma(1))
    eje.legend(loc="upper right")
    return _guardar(figura, ruta)


def agregados_niveles(panel: pd.DataFrame, ruta: Path) -> Path:
    """M1, M2 y M3 en índice mayo de 2002 = 100, para poder compararlos."""
    _estilo()
    figura, eje = plt.subplots(figsize=(10.5, 5.2))
    colores = {"m1": AZUL, "m2": VERDE, "m3": TEJA}
    nombres = {"m1": "M1", "m2": "M2", "m3": "M3"}
    for columna, color in colores.items():
        indice = 100.0 * panel[columna] / panel[columna].iloc[0]
        eje.plot(panel.index, indice, color=color, lw=1.7, label=nombres[columna])
    eje.set_title("Agregados monetarios (índice, mayo de 2002 = 100)")
    eje.set_ylabel("Índice")
    eje.set_xlabel("Mes")
    eje.yaxis.set_major_formatter(_coma(0))
    eje.legend(loc="upper left")
    return _guardar(figura, ruta)


def agregados_crecimiento(panel: pd.DataFrame, ruta: Path) -> Path:
    """Crecimiento anual logarítmico de M1, M2 y M3."""
    _estilo()
    figura, eje = plt.subplots(figsize=(10.5, 5.2))
    for columna, color, nombre in (
        ("g_m1", AZUL, "M1"),
        ("g_m2", VERDE, "M2"),
        ("g_m3", TEJA, "M3"),
    ):
        eje.plot(panel.index, panel[columna], color=color, lw=1.5, label=nombre)
    eje.axhline(0, color=GRIS, lw=0.8)
    eje.set_title("Crecimiento anual de los agregados")
    eje.set_ylabel("100 × ln(Mₜ / Mₜ₋₁₂)")
    eje.set_xlabel("Mes")
    eje.yaxis.set_major_formatter(_coma(0))
    eje.legend(loc="upper right", ncol=3)
    return _guardar(figura, ruta)


def matriz_correlacion(panel: pd.DataFrame, ruta: Path) -> Path:
    """Matriz de correlación de la tasa, la política, los agregados y la inflación."""
    _estilo()
    columnas = ["y", "pol", "spread", "g_m1", "g_m2", "g_m3", "inflacion", "brecha_inflacion"]
    etiquetas = [
        "Tasa",
        "Política",
        "Spread",
        "g(M1)",
        "g(M2)",
        "g(M3)",
        "Inflación",
        "Brecha",
    ]
    matriz = panel[columnas].corr()
    figura, eje = plt.subplots(figsize=(8.2, 6.6))
    imagen = eje.imshow(matriz.to_numpy(), cmap="Blues", vmin=-1, vmax=1)
    eje.set_xticks(range(len(etiquetas)), etiquetas, rotation=45, ha="right")
    eje.set_yticks(range(len(etiquetas)), etiquetas)
    for i in range(len(columnas)):
        for j in range(len(columnas)):
            valor = matriz.iloc[i, j]
            eje.text(j, i, f"{valor:.2f}".replace(".", ","), ha="center", va="center", fontsize=8)
    eje.set_title("Correlaciones en la muestra mensual")
    figura.colorbar(imagen, ax=eje, fraction=0.046, pad=0.04)
    return _guardar(figura, ruta)


def correlacion_cruzada(panel: pd.DataFrame, ruta: Path) -> Path:
    """Rezagos 0 a 12 entre la tasa y el crecimiento de cada agregado."""
    _estilo()
    figura, eje = plt.subplots(figsize=(10.5, 5.2))
    rezagos = np.arange(0, 13)
    for columna, color, nombre in (
        ("g_m1", AZUL, "Crecimiento de M1"),
        ("g_m2", VERDE, "Crecimiento de M2"),
        ("g_m3", TEJA, "Crecimiento de M3"),
    ):
        valores = [panel["y"].corr(panel[columna].shift(k)) for k in rezagos]
        eje.plot(rezagos, valores, color=color, lw=1.7, marker="o", ms=3.5, label=nombre)
    eje.axhline(0, color=GRIS, lw=0.8)
    eje.set_title("Correlación de la tasa con el crecimiento monetario rezagado")
    eje.set_xlabel("Rezago del agregado, en meses")
    eje.set_ylabel("Correlación con la tasa de consumo")
    eje.set_xticks(rezagos)
    eje.yaxis.set_major_formatter(_coma(2))
    eje.legend(loc="best")
    return _guardar(figura, ruta)


def rmse_horizonte(metricas: pd.DataFrame, ruta: Path) -> Path:
    """RMSE de los tres modelos de la referencia, por horizonte."""
    _estilo()
    ids = ["ridge_agregados", "ridge_tasa_politica", "paseo_aleatorio"]
    colores = [AZUL, DORADO, GRIS]
    figura, eje = plt.subplots(figsize=(10.5, 5.2))
    x = np.arange(len(HORIZONTES_REPORTE))
    ancho = 0.24
    for i, (modelo, color) in enumerate(zip(ids, colores, strict=True)):
        valores = []
        for horizonte in HORIZONTES_REPORTE:
            fila = metricas[(metricas["modelo"] == modelo) & (metricas["horizonte"] == horizonte)]
            valores.append(float(fila["rmse"].iloc[0]))
        eje.bar(x + (i - 1) * ancho, valores, width=ancho, color=color, label=NOMBRES_MODELO[modelo])
    eje.set_xticks(x, [str(h) for h in HORIZONTES_REPORTE])
    eje.set_xlabel("Horizonte, en meses")
    eje.set_ylabel("RMSE, puntos porcentuales")
    eje.set_title("Error del backtest frente a la tasa constante")
    eje.yaxis.set_major_formatter(_coma(2))
    eje.legend(loc="upper left")
    return _guardar(figura, ruta)


def proyeccion(
    panel: pd.DataFrame,
    senda: pd.DataFrame,
    ruta: Path,
    desde: str = "2016-01-01",
) -> Path:
    """Historia reciente, proyección y bandas del modelo principal."""
    _estilo()
    historia = panel.loc[desde:]
    figura, eje = plt.subplots(figsize=(10.5, 5.4))
    eje.plot(historia.index, historia["y"], color=AZUL, lw=1.8, label="Tasa observada")
    eje.plot(senda["fecha"], senda["proyeccion"], color=TEJA, lw=1.8, label="Proyección")
    eje.fill_between(
        senda["fecha"],
        senda["banda_95_inferior"],
        senda["banda_95_superior"],
        color=BANDA,
        alpha=0.35,
        label="Banda 95 %",
    )
    eje.fill_between(
        senda["fecha"],
        senda["banda_80_inferior"],
        senda["banda_80_superior"],
        color=AZUL,
        alpha=0.25,
        label="Banda 80 %",
    )
    eje.set_title("Proyección desde septiembre de 2026")
    eje.set_ylabel("Porcentaje efectivo anual")
    eje.set_xlabel("Mes")
    eje.yaxis.set_major_formatter(_coma(1))
    eje.legend(loc="upper left")
    return _guardar(figura, ruta)


def residuos(errores: pd.DataFrame, ruta: Path) -> Path:
    """Errores de un mes del Ridge con agregados, en el tiempo y en histograma."""
    _estilo()
    h1 = errores[(errores["modelo"] == "ridge_agregados") & (errores["horizonte"] == 1)].sort_values(
        "fecha_objetivo"
    )
    figura, ejes = plt.subplots(1, 2, figsize=(10.8, 4.6))
    ejes[0].axhline(0, color=GRIS, lw=0.8)
    ejes[0].plot(h1["fecha_objetivo"], h1["error"], color=AZUL, lw=1.1)
    ejes[0].set_title("Error a un mes")
    ejes[0].set_ylabel("Realizada − pronóstico, puntos")
    ejes[0].yaxis.set_major_formatter(_coma(1))
    ejes[1].hist(h1["error"], bins=20, color=AZUL, alpha=0.85)
    ejes[1].set_title("Distribución del error a un mes")
    ejes[1].set_xlabel("Error, puntos porcentuales")
    ejes[1].xaxis.set_major_formatter(_coma(1))
    return _guardar(figura, ruta)


def rmse_regimenes(tabla: pd.DataFrame, ruta: Path) -> Path:
    """RMSE a 12 meses en los regímenes que sí entran en la evaluación."""
    _estilo()
    modelos = ["ridge_agregados", "ridge_tasa_politica", "paseo_aleatorio"]
    colores = [AZUL, DORADO, GRIS]
    regimenes = [r for r in tabla["regimen"].unique() if r != "2008-2009"]
    figura, eje = plt.subplots(figsize=(10.5, 5.2))
    x = np.arange(len(regimenes))
    ancho = 0.24
    recorte = tabla[tabla["horizonte"] == 12]
    for i, (modelo, color) in enumerate(zip(modelos, colores, strict=True)):
        valores = []
        for regimen in regimenes:
            fila = recorte[(recorte["modelo"] == modelo) & (recorte["regimen"] == regimen)]
            valores.append(float(fila["rmse"].iloc[0]) if len(fila) else np.nan)
        eje.bar(x + (i - 1) * ancho, valores, width=ancho, color=color, label=NOMBRES_MODELO[modelo])
    eje.set_xticks(x, regimenes)
    eje.set_ylabel("RMSE a 12 meses, puntos")
    eje.set_title("Error a 12 meses según el régimen del mes objetivo")
    eje.yaxis.set_major_formatter(_coma(2))
    eje.legend(loc="upper left")
    return _guardar(figura, ruta)
