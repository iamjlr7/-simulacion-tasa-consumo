"""Las tres predicciones que se pueden elegir: optimista, conservadora y pesimista."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.config import DATOS_PROCESADOS, HORIZONTE_MAX, PREDICCION_POR_DEFECTO, PREDICCIONES
from src.exportar_sitio import construir_datos
from src.forecast import senda_prediccion


@pytest.fixture(scope="module")
def senda() -> pd.DataFrame:
    proyeccion = pd.read_csv(DATOS_PROCESADOS / "proyeccion.csv")
    return proyeccion.loc[proyeccion["modelo"] == "ridge_agregados"]


@pytest.fixture(scope="module")
def datos() -> dict:
    return construir_datos()


def test_hay_tres_predicciones_y_una_por_defecto() -> None:
    assert list(PREDICCIONES) == ["optimista", "conservadora", "pesimista"]
    assert PREDICCION_POR_DEFECTO == "conservadora"
    for ficha in PREDICCIONES.values():
        assert ficha["nombre"] and ficha["resumen"] and ficha["detalle"]


def test_cada_prediccion_es_una_sola_senda(senda: pd.DataFrame) -> None:
    for tipo in PREDICCIONES:
        serie = senda_prediccion(senda, tipo)
        assert list(serie.index) == list(range(1, HORIZONTE_MAX + 1))
        assert np.isfinite(serie.to_numpy()).all()


def test_el_orden_es_el_de_quien_pide_el_credito(senda: pd.DataFrame) -> None:
    """La optimista es la tasa más baja y la pesimista, la más alta."""
    optimista = senda_prediccion(senda, "optimista")
    conservadora = senda_prediccion(senda, "conservadora")
    pesimista = senda_prediccion(senda, "pesimista")
    assert (optimista < conservadora).all()
    assert (conservadora < pesimista).all()


def test_la_conservadora_es_la_proyeccion_publicada(senda: pd.DataFrame) -> None:
    conservadora = senda_prediccion(senda)
    assert conservadora[1] == pytest.approx(21.53, abs=0.005)
    assert conservadora[12] == pytest.approx(23.84, abs=0.005)


def test_prediccion_desconocida_falla(senda: pd.DataFrame) -> None:
    with pytest.raises(ValueError):
        senda_prediccion(senda, "neutral")


def test_la_pagina_recibe_las_tres_predicciones(datos: dict) -> None:
    assert [p["id"] for p in datos["meta"]["predicciones"]] == list(PREDICCIONES)
    assert datos["meta"]["prediccion_por_defecto"] == PREDICCION_POR_DEFECTO


def test_la_pagina_reproduce_optimista_y_pesimista(datos: dict, senda: pd.DataFrame) -> None:
    """Los percentiles 10 y 90 de los errores exportados dan las bandas publicadas.

    Es la cuenta que hace el navegador para dibujar la predicción elegida.
    """
    errores = datos["errores"]["ridge_agregados"]["e"]
    central = datos["proyeccion"]["ridge_agregados"]["central"]
    optimista = senda_prediccion(senda, "optimista")
    pesimista = senda_prediccion(senda, "pesimista")
    assert len(errores) > 150
    for i in range(HORIZONTE_MAX):
        conocidos = np.array([fila[i] for fila in errores if fila[i] is not None], dtype=float)
        assert len(conocidos) >= 100
        assert central[i] + np.quantile(conocidos, 0.10) == pytest.approx(optimista[i + 1], abs=2e-3)
        assert central[i] + np.quantile(conocidos, 0.90) == pytest.approx(pesimista[i + 1], abs=2e-3)
