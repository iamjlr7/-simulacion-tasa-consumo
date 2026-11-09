"""Backtest del Ridge, ausencia de look-ahead y forma de la proyección."""

from __future__ import annotations

import numpy as np
import pytest

from src.backtest import calcular_metricas, correr_backtest
from src.config import (
    FEATURES_AGREGADOS,
    FEATURES_TASA_POLITICA,
    PROYECCION_REFERENCIA,
    RMSE_REFERENCIA,
    TOLERANCIA_RMSE,
)
from src.features import cargar_panel, pares_directos
from src.forecast import construir_proyeccion, proyectar_escenario
from src.models import PaseoAleatorio, RidgeDirecto, ajustar_ridge


@pytest.fixture(scope="module")
def material() -> dict:
    panel = cargar_panel()
    modelos = [
        RidgeDirecto("ridge_agregados", FEATURES_AGREGADOS),
        RidgeDirecto("ridge_tasa_politica", FEATURES_TASA_POLITICA),
        PaseoAleatorio(),
    ]
    predicciones = correr_backtest(panel, modelos)
    metricas = calcular_metricas(predicciones, panel)
    proyeccion = construir_proyeccion(panel, modelos[0], predicciones)
    return {
        "panel": panel,
        "predicciones": predicciones,
        "metricas": metricas,
        "proyeccion": proyeccion,
    }


def test_pares_no_pasan_del_origen() -> None:
    panel = cargar_panel()
    origen = 190
    horizonte = 12
    _matriz, _cambio, indices = pares_directos(panel.iloc[: origen + 1], FEATURES_AGREGADOS, horizonte)
    assert indices.max() + horizonte == origen
    assert (indices + horizonte <= origen).all()


def test_escalado_no_usa_el_origen_ni_el_futuro() -> None:
    panel = cargar_panel()
    origen = 180
    horizonte = 6
    matriz, _cambio, _indices = pares_directos(
        panel.iloc[: origen + 1], FEATURES_AGREGADOS, horizonte
    )
    ajuste = ajustar_ridge(panel, origen, horizonte)
    assert ajuste.media == pytest.approx(matriz.mean(axis=0))
    assert ajuste.n == len(matriz)
    x_origen = panel.iloc[origen][list(FEATURES_AGREGADOS)].to_numpy(dtype=float)
    media_si_entrara_el_origen = np.vstack([matriz, x_origen]).mean(axis=0)
    assert not np.allclose(ajuste.media, media_si_entrara_el_origen)

    sucio = panel.copy()
    futuro = sucio.index[origen + 1 :]
    sucio.loc[futuro, "y"] = 90.0
    sucio.loc[futuro, "pol"] = 0.5
    sucio.loc[futuro, "g_m1"] = -40.0
    sucio.loc[futuro, "g_m2"] = -40.0
    sucio.loc[futuro, "g_m3"] = -40.0
    alterado = ajustar_ridge(sucio, origen, horizonte)
    assert alterado.media == pytest.approx(ajuste.media)
    assert alterado.nivel == pytest.approx(ajuste.nivel)
    assert RidgeDirecto().proyectar(sucio, origen, [horizonte])[horizonte] == pytest.approx(
        ajuste.nivel
    )


def test_dimensiones_de_la_proyeccion(material: dict) -> None:
    proyeccion = material["proyeccion"]
    assert len(proyeccion) == 24
    assert list(proyeccion["horizonte"]) == list(range(1, 25))
    assert proyeccion["proyeccion"].notna().all()
    assert proyeccion["rmse_historico"].notna().all()
    assert (proyeccion["banda_80_superior"] >= proyeccion["banda_80_inferior"]).all()
    assert (proyeccion["banda_95_superior"] >= proyeccion["banda_80_superior"]).all()
    assert (proyeccion["banda_80_inferior"] >= proyeccion["banda_95_inferior"]).all()
    anchos = (
        proyeccion["banda_95_superior"] - proyeccion["banda_95_inferior"]
    ).to_numpy()
    assert anchos[0] < anchos[11] < anchos[23]


def test_reproduccion_rmse_de_referencia(material: dict) -> None:
    """La tolerancia es 0,05 puntos, la que fija el encargo.

    La proyección puntual reproduce la referencia al centésimo. El RMSE queda
    a unas centésimas, dentro de esta tolerancia; el informe publica la
    diferencia exacta y no se amplía el margen para esconderla.
    """
    metricas = material["metricas"]
    predicciones = material["predicciones"]
    un_mes = predicciones[
        (predicciones["modelo"] == "ridge_agregados") & (predicciones["horizonte"] == 1)
    ]
    assert len(un_mes) == 173
    assert un_mes["fecha_objetivo"].min().strftime("%Y-%m") == "2012-05"
    for modelo, publicados in RMSE_REFERENCIA.items():
        for horizonte, publicado in publicados.items():
            fila = metricas[
                (metricas["modelo"] == modelo) & (metricas["horizonte"] == horizonte)
            ]
            assert float(fila["rmse"].iloc[0]) == pytest.approx(publicado, abs=TOLERANCIA_RMSE)


def test_reproduccion_de_la_proyeccion(material: dict) -> None:
    proyeccion = material["proyeccion"].set_index("horizonte")
    for horizonte, publicado in PROYECCION_REFERENCIA.items():
        assert float(proyeccion.loc[horizonte, "proyeccion"]) == pytest.approx(publicado, abs=0.02)


def test_escenario_neutro_no_mueve_la_proyeccion(material: dict) -> None:
    base = material["proyeccion"].set_index("horizonte")["proyeccion"]
    escenario = proyectar_escenario(material["panel"], delta_politica_pb=0.0)
    for horizonte in (1, 6, 12):
        assert escenario[horizonte] == pytest.approx(float(base.loc[horizonte]))
