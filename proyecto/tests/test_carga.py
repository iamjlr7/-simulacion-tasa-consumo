"""Carga de los CSV y del panel mensual."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.config import COL_CONSUMO, DATOS_CRUDOS, N_OBSERVACIONES, TIENDA
from src.data_loader import construir_base, leer_csv, observacion_parcial
from src.features import cargar_panel

ARCHIVOS = (
    "Tasas_de_interes.csv",
    "Tasas_de_politica_monetaria.csv",
    "Agregados_monetarios_y_crediticios_mensual.csv",
    "Agregados_monetarios_y_crediticios_semanal.csv",
    "Inflacion_y_meta.csv",
    "IPC.csv",
)


def test_separador_decimal_y_bom() -> None:
    tabla = leer_csv(DATOS_CRUDOS / "Tasas_de_interes.csv")
    assert tabla.columns[0] != ""
    assert not str(tabla.columns[0]).startswith("\ufeff")
    assert tabla[COL_CONSUMO].iloc[0] == pytest.approx(28.2)
    assert tabla.iloc[0, 0] == pytest.approx(16.46)


def test_copia_no_mueve_los_originales() -> None:
    for nombre in ARCHIVOS:
        assert (TIENDA / "data" / "raw" / nombre).is_file()
        assert (DATOS_CRUDOS / nombre).is_file()
        assert Path(TIENDA / "data" / "raw" / nombre).stat().st_size > 0


def test_panel_mensual_de_modelado() -> None:
    panel = cargar_panel()
    assert len(panel) == N_OBSERVACIONES
    assert panel.index.min().strftime("%Y-%m") == "2002-05"
    assert panel.index.max().strftime("%Y-%m") == "2026-09"
    assert panel["y"].iloc[-1] == pytest.approx(21.25)
    assert panel["pol"].iloc[-1] == pytest.approx(12.0)
    assert "2026-10" not in set(panel.index.strftime("%Y-%m"))
    assert panel[["y", "pol", "m1", "m2", "m3", "inflacion", "meta", "ipc"]].isna().sum().sum() == 0


def test_octubre_queda_fuera_del_entrenamiento() -> None:
    base = construir_base()
    parcial = observacion_parcial()
    assert base.index.max().strftime("%Y-%m") == "2026-09"
    assert parcial["mes"] == "2026-10"
    assert parcial["n_viernes"] == 4
    assert parcial["tasa_promedio"] == pytest.approx(21.3625)
    assert "Solo contraste" in parcial["uso"]
