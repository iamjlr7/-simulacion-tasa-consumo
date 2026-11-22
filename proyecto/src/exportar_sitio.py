"""Empaqueta los resultados del estudio en ``sitio/datos.js``.

La página es estática: no llama a Python. Para que la simulación corra en el
navegador se exportan, además de las series y las métricas:

- el ajuste del Ridge en el origen, horizonte por horizonte (intercepto,
  coeficientes, media y desviación del escalado), con lo que la página puede
  recalcular la proyección cuando se mueven las condiciones iniciales;
- los errores del backtest como trayectorias completas de 24 meses por origen,
  que son la materia prima de la simulación por remuestreo.

Uso::

    python -m src.exportar_sitio
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.config import (
    ARCHIVO_TASAS,
    AUTORES,
    COL_CONSUMO,
    COL_POLITICA,
    ARCHIVO_POLITICA,
    DATOS_CRUDOS,
    DATOS_EXTERNOS,
    DATOS_PROCESADOS,
    DERECHOS,
    ETIQUETA_FEATURE,
    FEATURES_AGREGADOS,
    FEATURES_REAL,
    FEATURES_TASA_POLITICA,
    HORIZONTE_MAX,
    LEMA_PROYECTO,
    NOMBRE_PROYECTO,
    NOMBRES_MODELO,
    PREDICCION_POR_DEFECTO,
    PREDICCIONES,
    PRIMERA_PREDICCION,
    RIDGE_LAMBDA,
    SITIO,
    VARIABLES_NUEVAS,
)
from src.data_loader import cargar_mercado, leer_csv, observacion_parcial
from src.features import cargar_panel
from src.models import ajustar_ridge

COLUMNAS_PANEL: tuple[str, ...] = (
    "y", "pol", "inflacion", "meta", "m1", "m2", "m3", "g_m1", "g_m2", "g_m3",
    "spread", "dy3", "dpol3", "tasa_real", "trm", "g_trm", "fed", "dif_fed", "ibc", "usura",
)
RIDGE_EXPORTADOS: dict[str, tuple[str, ...]] = {
    "ridge_agregados": FEATURES_AGREGADOS,
    "ridge_real": FEATURES_REAL,
    "ridge_tasa_politica": FEATURES_TASA_POLITICA,
}
FUENTES: tuple[dict[str, str], ...] = (
    {
        "serie": "Tasa del crédito de consumo, colocación y comercial",
        "entidad": "Banco de la República",
        "frecuencia": "Semanal",
        "url": "https://suameca.banrep.gov.co/estadisticas-economicas/",
        "archivo": "Tasas_de_interes.csv",
    },
    {
        "serie": "Tasa de política monetaria",
        "entidad": "Banco de la República",
        "frecuencia": "Diaria",
        "url": "https://suameca.banrep.gov.co/estadisticas-economicas/",
        "archivo": "Tasas_de_politica_monetaria.csv",
    },
    {
        "serie": "Base monetaria, M1, M2 y M3",
        "entidad": "Banco de la República",
        "frecuencia": "Mensual y semanal",
        "url": "https://suameca.banrep.gov.co/estadisticas-economicas/",
        "archivo": "Agregados_monetarios_y_crediticios_mensual.csv",
    },
    {
        "serie": "Inflación anual, meta e IPC",
        "entidad": "Banco de la República y DANE",
        "frecuencia": "Mensual",
        "url": "https://suameca.banrep.gov.co/estadisticas-economicas/",
        "archivo": "Inflacion_y_meta.csv",
    },
    {
        "serie": "Tasa de cambio representativa del mercado (TRM)",
        "entidad": "Superintendencia Financiera · datos.gov.co",
        "frecuencia": "Diaria, en vivo",
        "url": "https://www.datos.gov.co/d/mcec-87by",
        "archivo": "externos/trm_diaria.csv",
    },
    {
        "serie": "Interés bancario corriente y tasa de usura",
        "entidad": "Superintendencia Financiera · datos.gov.co",
        "frecuencia": "Mensual, en vivo",
        "url": "https://www.datos.gov.co/d/pare-7x5i",
        "archivo": "externos/interes_bancario_corriente.csv",
    },
    {
        "serie": "Tasas de libre inversión por entidad",
        "entidad": "Superintendencia Financiera · datos.gov.co",
        "frecuencia": "Semanal, en vivo",
        "url": "https://www.datos.gov.co/d/qzsc-9esp",
        "archivo": "externos/libre_inversion_por_entidad.csv",
    },
    {
        "serie": "Tasa efectiva de fondos federales (EFFR)",
        "entidad": "Reserva Federal de Nueva York",
        "frecuencia": "Diaria, en vivo",
        "url": "https://www.newyorkfed.org/markets/reference-rates/effr",
        "archivo": "externos/fed_effr_diaria.csv",
    },
)


def _num(valor: Any, decimales: int = 4) -> float | None:
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numero):
        return None
    return round(numero, decimales)


def _lista(serie: pd.Series, decimales: int = 4) -> list[float | None]:
    return [_num(valor, decimales) for valor in serie.to_numpy()]


def _panel(panel: pd.DataFrame) -> dict[str, list]:
    salida: dict[str, list] = {"fecha": [fecha.date().isoformat() for fecha in panel.index]}
    for columna in COLUMNAS_PANEL:
        if columna in panel:
            decimales = 2 if columna in ("m1", "m2", "m3", "trm") else 4
            salida[columna] = _lista(panel[columna], decimales)
    return salida


def _ridge(panel: pd.DataFrame) -> dict[str, Any]:
    """Ajuste en el origen de cada Ridge exportado, para recalcular en la página."""
    origen = len(panel) - 1
    salida: dict[str, Any] = {}
    for modelo, columnas in RIDGE_EXPORTADOS.items():
        ajustes = []
        for horizonte in range(1, HORIZONTE_MAX + 1):
            ajuste = ajustar_ridge(panel, origen, horizonte, columnas, RIDGE_LAMBDA)
            ajustes.append(
                {
                    "b0": _num(ajuste.intercepto, 6),
                    "coef": [_num(ajuste.coeficientes[c], 6) for c in columnas],
                    "media": [_num(v, 6) for v in ajuste.media],
                    "desv": [_num(v, 6) for v in ajuste.desviacion],
                    "n": ajuste.n,
                }
            )
        salida[modelo] = {
            "columnas": list(columnas),
            "x_origen": [_num(panel[c].iloc[origen], 6) for c in columnas],
            "ajustes": ajustes,
        }
    return salida


def _errores(predicciones: pd.DataFrame) -> dict[str, Any]:
    """Trayectorias de error por modelo y origen, de 1 a 24 meses.

    Entran todos los orígenes del backtest. Los más recientes todavía no
    tienen 24 meses de resultado: sus horizontes pendientes van como ``null``.
    Así los cuantiles que calcula la página en cada horizonte usan los mismos
    errores que la banda publicada en ``proyeccion.csv``.
    """
    salida: dict[str, Any] = {}
    for modelo, grupo in predicciones.groupby("modelo", sort=False):
        tabla = grupo.pivot(index="origen", columns="horizonte", values="error")
        tabla = tabla.reindex(columns=range(1, HORIZONTE_MAX + 1)).sort_index()
        salida[str(modelo)] = {
            "origen": [pd.Timestamp(fecha).date().isoformat() for fecha in tabla.index],
            "e": [[_num(v, 3) for v in fila] for fila in tabla.to_numpy()],
        }
    return salida


def _por_modelo(tabla: pd.DataFrame, columnas: dict[str, str], decimales: int = 4) -> dict[str, Any]:
    salida: dict[str, Any] = {}
    for modelo, grupo in tabla.groupby("modelo", sort=False):
        ordenado = grupo.sort_values("horizonte")
        salida[str(modelo)] = {
            destino: [
                (int(v) if destino == "n" else _num(v, decimales)) for v in ordenado[origen].to_numpy()
            ]
            for origen, destino in columnas.items()
        }
    return salida


def _semanal_banrep(directorio: Path) -> dict[str, list]:
    """Últimos tres años de la tasa semanal de consumo, para el seguimiento."""
    tasas = leer_csv(directorio / ARCHIVO_TASAS)[COL_CONSUMO].dropna()
    reciente = tasas.loc[tasas.index >= tasas.index.max() - pd.DateOffset(years=3)]
    return {
        "fecha": [fecha.date().isoformat() for fecha in reciente.index],
        "y": [round(float(v), 2) for v in reciente.to_numpy()],
    }


def _politica(directorio: Path) -> dict[str, Any]:
    politica = leer_csv(directorio / ARCHIVO_POLITICA)[COL_POLITICA].dropna()
    cambios = politica[politica.diff().fillna(1) != 0]
    return {
        "fecha": politica.index.max().date().isoformat(),
        "valor": float(politica.iloc[-1]),
        "desde": cambios.index.max().date().isoformat(),
        "anterior": float(cambios.iloc[-2]) if len(cambios) > 1 else None,
    }


def _mercado() -> dict[str, Any]:
    tablas = cargar_mercado()
    salida: dict[str, Any] = {}
    if "por_entidad" in tablas and len(tablas["por_entidad"]):
        por_entidad = tablas["por_entidad"]
        ultimo = por_entidad["fecha"].max()
        corte = por_entidad.loc[por_entidad["fecha"] == ultimo].sort_values("monto", ascending=False)
        salida["corte"] = str(ultimo)
        salida["entidades"] = [
            {
                "entidad": str(fila.entidad),
                "tipo": str(fila.tipo_entidad),
                "tasa": _num(fila.tasa, 2),
                "monto": _num(fila.monto, 0),
                "creditos": int(fila.creditos),
            }
            for fila in corte.itertuples()
        ]
    if "semanal" in tablas:
        semanal = tablas["semanal"]
        salida["semanal"] = {
            "fecha": [str(f) for f in semanal["fecha"]],
            "tasa": [_num(v, 2) for v in semanal["tasa"]],
            "monto": [_num(v, 0) for v in semanal["monto"]],
            "creditos": [int(v) for v in semanal["creditos"]],
        }
    if "ibc" in tablas:
        ibc = tablas["ibc"]
        ultima = ibc.iloc[-1]
        salida["usura"] = {
            "desde": str(ultima["desde"])[:10],
            "hasta": str(ultima["hasta"])[:10],
            "ibc": _num(ultima["ibc"], 2),
            "usura": _num(ultima["usura"], 2),
            "resolucion": str(ultima["resolucion"]),
        }
    return salida


def _instantanea_externa() -> dict[str, Any]:
    """Último dato descargado de TRM y Fed: respaldo si la página no tiene red."""
    salida: dict[str, Any] = {}
    for clave, archivo, columna in (("trm", "trm_diaria.csv", "trm"), ("fed", "fed_effr_diaria.csv", "effr")):
        ruta = DATOS_EXTERNOS / archivo
        if not ruta.is_file():
            continue
        tabla = pd.read_csv(ruta).tail(400)
        salida[clave] = {
            "fecha": [str(f)[:10] for f in tabla["fecha"]],
            "valor": [_num(v, 2) for v in tabla[columna]],
        }
    ficha = DATOS_EXTERNOS / "fuentes.json"
    if ficha.is_file():
        salida["descargado"] = json.loads(ficha.read_text(encoding="utf-8")).get("descargado")
    return salida


def _variables_nuevas(directorio: Path) -> list[dict[str, Any]]:
    ruta = directorio / "variables_nuevas.csv"
    if not ruta.is_file():
        return []
    tabla = pd.read_csv(ruta)
    filas: list[dict[str, Any]] = []
    for clave, (etiqueta, columnas) in VARIABLES_NUEVAS.items():
        grupo = tabla.loc[tabla["id"] == clave].sort_values("horizonte")
        if grupo.empty:
            continue
        filas.append(
            {
                "id": clave,
                "etiqueta": etiqueta,
                "columnas": list(columnas),
                "horizonte": [int(h) for h in grupo["horizonte"]],
                "rmse": [_num(v, 4) for v in grupo["rmse"]],
                "n": [int(v) for v in grupo["n"]],
            }
        )
    return filas


def _estudio(directorio: Path) -> dict[str, Any]:
    salida: dict[str, Any] = {}
    ruta_pruebas = directorio / "pruebas.json"
    if ruta_pruebas.is_file():
        pruebas = json.loads(ruta_pruebas.read_text(encoding="utf-8"))
        salida["vif"] = {k: _num(v, 2) for k, v in pruebas.get("vif", {}).items()}
        cruzada = pruebas.get("correlacion_cruzada", {})
        salida["cruzada"] = {
            variable: {str(rezago): _num(valor, 3) for rezago, valor in rezagos.items()}
            for variable, rezagos in cruzada.items()
            if variable in ("pol", "g_m1", "g_m2", "g_m3")
        }
        raices = pruebas.get("raices", {})
        salida["raices"] = {
            variable: {clave: _num(valor, 4) for clave, valor in datos.items() if isinstance(valor, (int, float))}
            for variable, datos in raices.items()
            if variable in ("y", "dy", "pol", "spread", "g_m2")
        }
    ruta_coef = directorio / "coeficientes.csv"
    if ruta_coef.is_file():
        coef = pd.read_csv(ruta_coef)
        salida["coeficientes"] = {
            str(variable): [_num(v, 4) for v in grupo.sort_values("horizonte")["coeficiente"]]
            for variable, grupo in coef.groupby("variable", sort=False)
        }
    return salida


def construir_datos(directorio_procesado: Path | None = None) -> dict[str, Any]:
    """Reúne todo lo que la página necesita en un solo diccionario."""
    procesado = directorio_procesado or DATOS_PROCESADOS
    panel = cargar_panel()
    predicciones = pd.read_csv(procesado / "predicciones.csv", parse_dates=["origen", "fecha_objetivo"])
    metricas = pd.read_csv(procesado / "metricas.csv")
    cobertura = pd.read_csv(procesado / "cobertura.csv")
    proyeccion = pd.read_csv(procesado / "proyeccion.csv", parse_dates=["fecha"])
    parcial = observacion_parcial()
    modelos = [m for m in NOMBRES_MODELO if m in set(metricas["modelo"])]
    primer = proyeccion.loc[proyeccion["modelo"] == modelos[0]].sort_values("horizonte")
    return {
        "meta": {
            "nombre": NOMBRE_PROYECTO,
            "lema": LEMA_PROYECTO,
            "autores": list(AUTORES),
            "derechos": DERECHOS,
            "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "origen": panel.index[-1].date().isoformat(),
            "inicio": panel.index[0].date().isoformat(),
            "meses": int(len(panel)),
            "primera_prediccion": PRIMERA_PREDICCION,
            "lambda": RIDGE_LAMBDA,
            "horizonte_max": HORIZONTE_MAX,
            "fechas_proyeccion": [f.date().isoformat() for f in primer["fecha"]],
            "predicciones": [
                {"id": clave, "nombre": ficha["nombre"], "resumen": ficha["resumen"], "detalle": ficha["detalle"]}
                for clave, ficha in PREDICCIONES.items()
            ],
            "prediccion_por_defecto": PREDICCION_POR_DEFECTO,
        },
        "nombres": {m: NOMBRES_MODELO[m] for m in modelos},
        "etiquetas": dict(ETIQUETA_FEATURE),
        "panel": _panel(panel),
        "parcial": {
            "mes": parcial["mes"],
            "tasa": _num(parcial["tasa_promedio"], 4),
            "n": parcial["n_viernes"],
            "desde": parcial["primer_viernes"],
            "hasta": parcial["ultimo_viernes"],
            "politica": _num(parcial["politica_promedio"], 4),
        },
        "semanal": _semanal_banrep(DATOS_CRUDOS),
        "politica": _politica(DATOS_CRUDOS),
        "proyeccion": _por_modelo(
            proyeccion,
            {
                "proyeccion": "central",
                "banda_80_inferior": "b80i",
                "banda_80_superior": "b80s",
                "banda_95_inferior": "b95i",
                "banda_95_superior": "b95s",
            },
        ),
        "metricas": _por_modelo(
            metricas,
            {
                "n": "n",
                "rmse": "rmse",
                "mae": "mae",
                "mase": "mase",
                "sesgo": "sesgo",
                "razon_rmse_paseo": "razon",
                "dm_pvalue": "dm_p",
            },
        ),
        "cobertura": _por_modelo(cobertura, {"n": "n", "cobertura_80": "c80", "cobertura_95": "c95"}),
        "errores": _errores(predicciones),
        "ridge": _ridge(panel),
        "variables_nuevas": _variables_nuevas(procesado),
        "mercado": _mercado(),
        "externos": _instantanea_externa(),
        "estudio": _estudio(procesado),
        "fuentes": list(FUENTES),
    }


def exportar(destino: Path | None = None, directorio_procesado: Path | None = None) -> Path:
    """Escribe ``datos.js`` con un único objeto global ``window.DATOS``."""
    salida = destino or (SITIO / "datos.js")
    salida.parent.mkdir(parents=True, exist_ok=True)
    datos = construir_datos(directorio_procesado)
    cuerpo = json.dumps(datos, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    salida.write_text(f"window.DATOS = {cuerpo};\n", encoding="utf-8")
    return salida


if __name__ == "__main__":
    ruta = exportar()
    print(f"{ruta} ({ruta.stat().st_size / 1024:.0f} KB)")
