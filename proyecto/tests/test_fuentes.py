"""Datos abiertos nuevos, modelos que los usan y paquete de datos de la página."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from src import fuentes
from src.config import (
    DATOS_EXTERNOS,
    FEATURES_AGREGADOS,
    FEATURES_REAL,
    HORIZONTE_MAX,
    VARIABLES_NUEVAS,
)
from src.exportar_sitio import construir_datos, exportar
from src.features import cargar_panel
from src.models import Combinado, RidgeDirecto


@pytest.fixture(scope="module")
def panel() -> pd.DataFrame:
    return cargar_panel()


@pytest.fixture(scope="module")
def datos() -> dict:
    return construir_datos()


def test_externos_entran_al_panel_sin_huecos(panel: pd.DataFrame) -> None:
    for archivo in ("trm_diaria.csv", "fed_effr_diaria.csv", "interes_bancario_corriente.csv"):
        assert (DATOS_EXTERNOS / archivo).is_file()
    assert panel[["trm", "fed", "tasa_real", "g_trm", "dif_fed"]].iloc[12:].isna().sum().sum() == 0
    assert panel["tasa_real"].iloc[-1] == pytest.approx(panel["pol"].iloc[-1] - panel["inflacion"].iloc[-1])
    assert panel["dif_fed"].iloc[-1] == pytest.approx(panel["pol"].iloc[-1] - panel["fed"].iloc[-1])


def test_usura_es_uno_y_medio_del_interes_corriente(panel: pd.DataFrame) -> None:
    con_dato = panel.dropna(subset=["usura"])
    assert con_dato.index.min().strftime("%Y-%m") == "2007-04"
    assert panel.loc[:"2007-03-31", "usura"].isna().all()
    assert np.allclose(con_dato["usura"], (con_dato["ibc"] * 1.5).round(2), atol=0.011)
    # La tasa promedio del mercado nunca supera su tope legal.
    assert (con_dato["holgura_usura"] > 0).all()


def test_variables_nuevas_existen_en_el_panel(panel: pd.DataFrame) -> None:
    assert "base" in VARIABLES_NUEVAS
    for _etiqueta, columnas in VARIABLES_NUEVAS.values():
        for columna in columnas:
            assert columna in panel.columns


def test_combinado_es_el_promedio_de_sus_dos_ridge(panel: pd.DataFrame) -> None:
    origen = 230
    horizontes = [1, 6, 12]
    agregados = RidgeDirecto("ridge_agregados", FEATURES_AGREGADOS).proyectar(panel, origen, horizontes)
    real = RidgeDirecto("ridge_real", FEATURES_REAL).proyectar(panel, origen, horizontes)
    combinado = Combinado().proyectar(panel, origen, horizontes)
    for h in horizontes:
        assert combinado[h] == pytest.approx((agregados[h] + real[h]) / 2)


def test_resumen_semanal_pondera_por_monto() -> None:
    por_entidad = pd.DataFrame(
        {
            "fecha": ["2026-11-06", "2026-11-06", "2026-11-13"],
            "entidad": ["A", "B", "A"],
            "tipo_entidad": ["banco", "banco", "banco"],
            "tasa": [20.0, 30.0, 25.0],
            "monto": [300.0, 100.0, 50.0],
            "creditos": [3, 1, 2],
        }
    )
    semanal = fuentes.resumen_semanal(por_entidad)
    assert list(semanal["fecha"]) == ["2026-11-06", "2026-11-13"]
    assert semanal["tasa"].iloc[0] == pytest.approx(22.5)
    assert semanal["creditos"].iloc[0] == 4
    assert semanal["entidades"].iloc[0] == 2


def test_lectura_del_interes_corriente_sin_red(monkeypatch: pytest.MonkeyPatch) -> None:
    respuesta = [
        {
            "resolucion": "1707",
            "vigencia_desde": "2026-11-01T00:00:00.000",
            "vigencia_hasta": "2026-11-30T00:00:00.000",
            "interes_bancario_corriente": "18.89%",
            "modalidad": "CONSUMO Y ORDINARIO",
        }
    ]
    monkeypatch.setattr(fuentes, "_get_json", lambda *args, **kwargs: respuesta)
    tabla = fuentes.descargar_ibc()
    assert tabla["ibc"].iloc[0] == pytest.approx(18.89)
    assert tabla["usura"].iloc[0] == pytest.approx(28.34)


def test_la_pagina_reproduce_la_proyeccion_del_ridge(datos: dict) -> None:
    """El cálculo que hace el navegador coincide con la proyección publicada."""
    tasa = datos["panel"]["y"][-1]
    for modelo in ("ridge_agregados", "ridge_real", "ridge_tasa_politica"):
        ridge = datos["ridge"][modelo]
        assert len(ridge["ajustes"]) == HORIZONTE_MAX
        for i, ajuste in enumerate(ridge["ajustes"]):
            cambio = ajuste["b0"] + sum(
                b * (x - media) / desv
                for b, x, media, desv in zip(ajuste["coef"], ridge["x_origen"], ajuste["media"], ajuste["desv"], strict=True)
            )
            assert tasa + cambio == pytest.approx(datos["proyeccion"][modelo]["central"][i], abs=1e-3)


def test_paquete_de_la_pagina_esta_completo(datos: dict, tmp_path) -> None:
    assert datos["meta"]["nombre"] == "TasaViva"
    assert len(datos["meta"]["autores"]) == 3
    assert datos["meta"]["origen"] == "2026-09-30"
    for modelo in ("ridge_agregados", "ridge_real", "combinado", "paseo_aleatorio"):
        assert len(datos["proyeccion"][modelo]["central"]) == HORIZONTE_MAX
        trayectorias = datos["errores"][modelo]["e"]
        assert len(trayectorias) >= 100
        assert all(len(fila) == HORIZONTE_MAX for fila in trayectorias)
    assert datos["mercado"]["usura"]["usura"] == pytest.approx(datos["mercado"]["usura"]["ibc"] * 1.5, abs=0.011)
    assert len(datos["mercado"]["entidades"]) > 10
    ruta = exportar(tmp_path / "datos.js")
    texto = ruta.read_text(encoding="utf-8")
    assert texto.startswith("window.DATOS = ")
    json.loads(texto[len("window.DATOS = ") :].rstrip().rstrip(";"))
