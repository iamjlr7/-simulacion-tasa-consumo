"""Ejecuta el estudio completo y deja panel, métricas, gráficos e informe."""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.backtest import (
    calcular_metricas,
    correr_backtest,
    metricas_por_regimen,
)
from src.config import (
    DATOS_PROCESADOS,
    DOCS,
    HORIZONTES_REPORTE,
    INFORME,
    MEDIA,
    REGIMENES,
)
from src.data_loader import evaluar_calidad
from src.features import cargar_panel
from src.forecast import construir_proyeccion
from src.informe import escribir_informe
from src.intervals import cobertura_expandida
from src.models import RidgeDirecto, ajustar_ridge, modelos_comparacion
from src.plots import (
    agregados_crecimiento,
    agregados_niveles,
    correlacion_cruzada,
    historia_tasas,
    matriz_correlacion,
    proyeccion,
    residuos,
    rmse_horizonte,
    rmse_regimenes,
)
from src.pruebas import diagnostico_residuales, ejecutar_pruebas


def _jsonable(valor: Any) -> Any:
    if isinstance(valor, dict):
        return {str(clave): _jsonable(contenido) for clave, contenido in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [_jsonable(item) for item in valor]
    if isinstance(valor, (np.floating, float)):
        numero = float(valor)
        return numero if math.isfinite(numero) else None
    if isinstance(valor, (np.integer, int)) and not isinstance(valor, bool):
        return int(valor)
    if isinstance(valor, (pd.Timestamp,)):
        return valor.date().isoformat()
    return valor


def _guardar_tabla(tabla: pd.DataFrame, ruta: Path) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tabla.to_csv(ruta, index=False)


def _rezago_maximo(cruzada: dict[str, dict[str, float]]) -> dict[str, dict[str, float | int]]:
    salida: dict[str, dict[str, float | int]] = {}
    for variable, rezagos in cruzada.items():
        if not variable.startswith("g_"):
            continue
        rezago, correlacion = max(rezagos.items(), key=lambda par: abs(par[1]))
        salida[variable] = {"rezago": int(rezago), "correlacion": float(correlacion)}
    return salida


def _descriptivos(panel: pd.DataFrame) -> dict[str, dict[str, float]]:
    salida: dict[str, dict[str, float]] = {}
    for columna in ("y", "pol", "spread", "g_m1", "g_m2", "g_m3", "inflacion", "brecha_inflacion"):
        serie = panel[columna].dropna()
        salida[columna] = {
            "media": float(serie.mean()),
            "desviacion": float(serie.std(ddof=1)),
            "minimo": float(serie.min()),
            "maximo": float(serie.max()),
        }
    return salida


def ejecutar(
    directorio_procesado: Path | None = None,
    directorio_media: Path | None = None,
    ruta_informe: Path | None = None,
) -> dict[str, Any]:
    """Corre calidad, pruebas, backtest, proyección, gráficos e informe."""
    procesado = directorio_procesado or DATOS_PROCESADOS
    media = directorio_media or MEDIA
    informe = ruta_informe or INFORME
    procesado.mkdir(parents=True, exist_ok=True)
    media.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    print("Construyendo el panel mensual…", flush=True)
    panel = cargar_panel()
    _guardar_tabla(panel.reset_index(), procesado / "panel_mensual.csv")
    calidad = evaluar_calidad()
    (procesado / "calidad.json").write_text(
        json.dumps(_jsonable(calidad), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("Pruebas de series…", flush=True)
    pruebas = ejecutar_pruebas(panel)
    (procesado / "pruebas.json").write_text(
        json.dumps(_jsonable(pruebas), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    diferencia_ipc = (panel["inflacion"] - panel["inflacion_ipc"]).dropna()
    eda = {
        "descriptivos": _descriptivos(panel),
        "correlacion_monetaria": {
            "g_m1_g_m2": float(panel["g_m1"].corr(panel["g_m2"])),
            "g_m1_g_m3": float(panel["g_m1"].corr(panel["g_m3"])),
            "g_m2_g_m3": float(panel["g_m2"].corr(panel["g_m3"])),
        },
        "rezago_maximo": _rezago_maximo(pruebas["correlacion_cruzada"]),
        "ipc_contra_inflacion": {
            "correlacion": float(panel["inflacion"].corr(panel["inflacion_ipc"])),
            "max_abs": float(diferencia_ipc.abs().max()),
            "mediana_abs": float(diferencia_ipc.abs().median()),
        },
    }
    (procesado / "eda.json").write_text(
        json.dumps(_jsonable(eda), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("Backtest de todos los modelos…", flush=True)
    modelos = modelos_comparacion()
    partes: list[pd.DataFrame] = []
    for modelo in modelos:
        inicio = time.perf_counter()
        partes.append(correr_backtest(panel, [modelo]))
        print(
            f"  {modelo.nombre}: {time.perf_counter() - inicio:.1f} s, sustituciones {modelo.fallos}",
            flush=True,
        )
    predicciones = pd.concat(partes, ignore_index=True)
    fallos = {modelo.id: int(modelo.fallos) for modelo in modelos}
    _guardar_tabla(predicciones, procesado / "predicciones.csv")

    metricas = calcular_metricas(predicciones, panel)
    _guardar_tabla(metricas, procesado / "metricas.csv")
    cobertura = cobertura_expandida(predicciones)
    _guardar_tabla(cobertura, procesado / "cobertura.csv")

    print("Proyección de septiembre de 2026…", flush=True)
    sendas = [construir_proyeccion(panel, modelo, predicciones) for modelo in modelos_comparacion()]
    senda = pd.concat(sendas, ignore_index=True)
    _guardar_tabla(senda, procesado / "proyeccion.csv")

    coeficientes_filas: list[dict[str, float | int | str]] = []
    for horizonte in range(1, 25):
        ajuste = ajustar_ridge(panel, len(panel) - 1, horizonte)
        for variable, coeficiente in ajuste.coeficientes.items():
            coeficientes_filas.append(
                {
                    "horizonte": horizonte,
                    "variable": variable,
                    "coeficiente": coeficiente,
                    "intercepto": ajuste.intercepto,
                    "n": ajuste.n,
                }
            )
    coeficientes = pd.DataFrame(coeficientes_filas)
    _guardar_tabla(coeficientes, procesado / "coeficientes.csv")

    regimenes_partes: list[pd.DataFrame] = []
    for nombre, inicio_reg, fin_reg in REGIMENES:
        if nombre == "2008-2009":
            continue
        tabla = metricas_por_regimen(predicciones, inicio_reg, fin_reg)
        tabla["regimen"] = nombre
        tabla["diseno"] = "backtest principal, 120 meses"
        regimenes_partes.append(tabla)

    print("Diagnóstico temprano de 2008-2009…", flush=True)
    tempranos = [
        RidgeDirecto("ridge_agregados"),
        RidgeDirecto("ridge_tasa_politica", ("dy3", "spread", "dpol3")),
        modelos[2],
    ]
    # El paseo ya usado en el bucle principal conserva estado; se crea uno nuevo.
    from src.models import PaseoAleatorio

    tempranos[2] = PaseoAleatorio()
    pred_temprana = correr_backtest(panel, tempranos, horizontes=(1, 3, 6, 12), min_meses=57)
    tabla_2008 = metricas_por_regimen(pred_temprana, "2008-01-01", "2009-12-31")
    tabla_2008["regimen"] = "2008-2009"
    tabla_2008["diseno"] = "diagnóstico, primer origen en enero de 2007"
    regimenes_partes.append(tabla_2008)
    regimenes = pd.concat(regimenes_partes, ignore_index=True)
    _guardar_tabla(regimenes, procesado / "regimenes.csv")

    errores_h1 = predicciones[
        (predicciones["modelo"] == "ridge_agregados") & (predicciones["horizonte"] == 1)
    ].sort_values("fecha_objetivo")
    residuales = diagnostico_residuales(errores_h1["error"])
    mitad = errores_h1["fecha_objetivo"].median()
    antes = errores_h1.loc[errores_h1["fecha_objetivo"] <= mitad, "error"]
    despues = errores_h1.loc[errores_h1["fecha_objetivo"] > mitad, "error"]
    residuales["rmse_primera_mitad"] = float(np.sqrt(np.mean(antes.to_numpy() ** 2)))
    residuales["rmse_segunda_mitad"] = float(np.sqrt(np.mean(despues.to_numpy() ** 2)))
    residuales["corte_mitad"] = pd.Timestamp(mitad).date().isoformat()

    print("Gráficos…", flush=True)
    graficos = [
        historia_tasas(panel, media / "tasa-consumo-y-politica.png"),
        agregados_niveles(panel, media / "agregados-niveles.png"),
        agregados_crecimiento(panel, media / "agregados-crecimiento.png"),
        matriz_correlacion(panel, media / "matriz-correlacion.png"),
        correlacion_cruzada(panel, media / "correlacion-cruzada.png"),
        rmse_horizonte(metricas, media / "rmse-por-horizonte.png"),
        proyeccion(
            panel,
            senda[senda["modelo"] == "ridge_agregados"],
            media / "proyeccion-septiembre-2026.png",
        ),
        residuos(predicciones, media / "residuos-un-paso.png"),
        rmse_regimenes(regimenes, media / "rmse-por-regimen.png"),
    ]
    for grafico in graficos:
        if not grafico.is_file():
            raise FileNotFoundError(grafico)

    escribir_informe(
        informe,
        calidad=calidad,
        pruebas=pruebas,
        metricas=metricas,
        proyeccion=senda,
        cobertura=cobertura,
        coeficientes=coeficientes,
        regimenes=regimenes,
        residuales=residuales,
        eda=eda,
        graficos=graficos,
        fallos=fallos,
    )
    print(f"Informe: {informe}", flush=True)
    return {
        "panel": panel,
        "metricas": metricas,
        "proyeccion": senda,
        "informe": informe,
        "graficos": graficos,
    }


if __name__ == "__main__":
    ejecutar()
