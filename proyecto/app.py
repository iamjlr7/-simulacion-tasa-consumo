"""Página del estudio: historia, proyección, backtest y lectura de las pruebas.

Todos los textos están en español. Las cifras salen de los archivos que escribe
``python -m src.analisis`` y de las mismas pruebas aplicadas a esos errores.
No se reestima el backtest al abrir la página.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

RAIZ = Path(__file__).resolve().parent
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from src.config import (  # noqa: E402
    DATOS_PROCESADOS,
    DERECHOS,
    LEMA_PROYECTO,
    NOMBRE_PROYECTO,
    ETIQUETA_FEATURE,
    HORIZONTES_REPORTE,
    MEDIA,
    NOMBRES_MODELO,
    PREDICCION_POR_DEFECTO,
    PREDICCIONES,
    RMSE_REFERENCIA,
    coma,
)
from src.data_loader import observacion_parcial  # noqa: E402
from src.features import cargar_panel  # noqa: E402
from src.forecast import proyectar_escenario  # noqa: E402
from src.pruebas import diagnostico_residuales  # noqa: E402

st.set_page_config(
    page_title=f"{NOMBRE_PROYECTO} · {LEMA_PROYECTO}",
    layout="wide",
    initial_sidebar_state="expanded",
)
st.markdown(
    """
    <style>
    [data-testid="stHeader"],
    [data-testid="stToolbar"],
    [data-testid="stDecoration"],
    [data-testid="stStatusWidget"],
    #MainMenu,
    footer,
    .stDeployButton,
    [data-testid="stAppDeployButton"],
    [data-testid="stToolbarActionButton"],
    a[href*="streamlit.io"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
    }
    .block-container {padding-top: 1.1rem; padding-bottom: 1.4rem; max-width: 1120px;}
    h1 {font-weight: 560; letter-spacing: 0; color: #1C1C1C; font-size: 1.55rem;}
    h2, h3 {color: #1C1C1C; font-weight: 560; margin-top: 0.55rem;}
    div[data-testid="stMetric"] {
        background: transparent;
        border-bottom: 1px solid #D5D7DA;
        border-radius: 0;
        padding: 0.15rem 0.2rem 0.45rem;
    }
    div[data-testid="stMetricValue"], div[data-testid="stMetricLabel"] {
        white-space: normal; overflow: visible; line-height: 1.25;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

AVISO = "Proyección estadística. No es asesoría financiera."
SECCIONES = (
    ("historial", "Historial"),
    ("proyeccion", "Proyección"),
    ("desempeno", "Desempeño"),
    ("estudio", "Estudio"),
)
SERIES_RAIZ = (
    ("y", "Tasa de consumo"),
    ("dy", "Diferencia de la tasa"),
    ("pol", "Tasa de política"),
    ("dpol", "Diferencia de la política"),
    ("m1", "M1, nivel"),
    ("m2", "M2, nivel"),
    ("m3", "M3, nivel"),
    ("d_m1", "Diferencia de M1"),
    ("d_m2", "Diferencia de M2"),
    ("d_m3", "Diferencia de M3"),
    ("g_m1", "Crecimiento de M1"),
    ("g_m2", "Crecimiento de M2"),
    ("g_m3", "Crecimiento de M3"),
    ("spread", "Spread"),
    ("inflacion", "Inflación"),
    ("brecha_inflacion", "Brecha de inflación"),
)
CAUSAS = (
    ("g_m1", "Crecimiento de M1"),
    ("g_m2", "Crecimiento de M2"),
    ("g_m3", "Crecimiento de M3"),
    ("dpol", "Diferencia de la política"),
)
GRAFICOS = (
    ("tasa-consumo-y-politica.png", "Tasa de consumo y tasa de política"),
    ("agregados-niveles.png", "Agregados en índice, mayo de 2002 = 100"),
    ("agregados-crecimiento.png", "Crecimiento anual de M1, M2 y M3"),
    ("matriz-correlacion.png", "Matriz de correlación"),
    ("correlacion-cruzada.png", "Correlación con el crecimiento rezagado"),
    ("rmse-por-horizonte.png", "RMSE del backtest por horizonte"),
    ("proyeccion-septiembre-2026.png", "Proyección desde septiembre de 2026"),
    ("residuos-un-paso.png", "Errores a un mes"),
    ("rmse-por-regimen.png", "RMSE a 12 meses por régimen"),
)


@st.cache_data(show_spinner="Cargando la muestra mensual…")
def cargar_muestra() -> pd.DataFrame:
    return cargar_panel()


@st.cache_data(show_spinner=False)
def cargar_parcial() -> dict:
    return observacion_parcial()


@st.cache_data(show_spinner="Leyendo los resultados guardados…")
def cargar_resultados() -> dict:
    """Lee el backtest ya calculado. No vuelve a estimar los modelos."""
    metricas = pd.read_csv(DATOS_PROCESADOS / "metricas.csv")
    proyeccion = pd.read_csv(DATOS_PROCESADOS / "proyeccion.csv", parse_dates=["fecha"])
    cobertura = pd.read_csv(DATOS_PROCESADOS / "cobertura.csv")
    coeficientes = pd.read_csv(DATOS_PROCESADOS / "coeficientes.csv")
    regimenes = pd.read_csv(DATOS_PROCESADOS / "regimenes.csv")
    predicciones = pd.read_csv(
        DATOS_PROCESADOS / "predicciones.csv",
        parse_dates=["origen", "fecha_objetivo"],
    )
    calidad = json.loads((DATOS_PROCESADOS / "calidad.json").read_text(encoding="utf-8"))
    pruebas = json.loads((DATOS_PROCESADOS / "pruebas.json").read_text(encoding="utf-8"))
    eda = json.loads((DATOS_PROCESADOS / "eda.json").read_text(encoding="utf-8"))
    return {
        "metricas": metricas,
        "proyeccion": proyeccion,
        "cobertura": cobertura,
        "coeficientes": coeficientes,
        "regimenes": regimenes,
        "predicciones": predicciones,
        "calidad": calidad,
        "pruebas": pruebas,
        "eda": eda,
        "residuales": _residuales(predicciones),
    }


def _residuales(predicciones: pd.DataFrame) -> dict:
    """Ljung-Box, Jarque-Bera y las dos mitades, sobre los errores ya guardados."""
    errores = predicciones[
        (predicciones["modelo"] == "ridge_agregados") & (predicciones["horizonte"] == 1)
    ].sort_values("fecha_objetivo")
    resumen = diagnostico_residuales(errores["error"])
    corte = errores["fecha_objetivo"].median()
    antes = errores.loc[errores["fecha_objetivo"] <= corte, "error"]
    despues = errores.loc[errores["fecha_objetivo"] > corte, "error"]
    resumen["rmse_primera_mitad"] = float((antes.pow(2).mean()) ** 0.5)
    resumen["rmse_segunda_mitad"] = float((despues.pow(2).mean()) ** 0.5)
    resumen["corte"] = pd.Timestamp(corte).date().isoformat()
    return resumen


def texto_p(valor: float | None) -> str:
    if valor is None or pd.isna(valor):
        return "—"
    if float(valor) < 0.001:
        return "< 0,001"
    return coma(float(valor), 3)


def lectura_raiz(adf: float, kpss: float) -> str:
    adf_rechaza = adf <= 0.05
    kpss_rechaza = kpss <= 0.05
    if (not adf_rechaza) and kpss_rechaza:
        return "Compatible con raíz unitaria"
    if adf_rechaza and not kpss_rechaza:
        return "Compatible con estacionariedad"
    if adf_rechaza and kpss_rechaza:
        return "Señales mixtas"
    return "Ninguna prueba rechaza su nula al 5 %"


def recortar(panel: pd.DataFrame, inicio, fin) -> pd.DataFrame:
    """Incluye el cierre de cada mes que toca el rango, no solo el día exacto."""
    periodos = panel.index.to_period("M")
    desde = pd.Timestamp(inicio).to_period("M")
    hasta = pd.Timestamp(fin).to_period("M")
    return panel.loc[(periodos >= desde) & (periodos <= hasta)]


def valor(metricas: pd.DataFrame, modelo: str, horizonte: int, columna: str = "rmse") -> float:
    fila = metricas[(metricas["modelo"] == modelo) & (metricas["horizonte"] == horizonte)]
    return float(fila[columna].iloc[0])


def tabla_visible(
    tabla: pd.DataFrame,
    decimales: int = 2,
    enteros: tuple[str, ...] = (),
    valores_p: tuple[str, ...] = (),
    decimales_columna: dict[str, int] | None = None,
) -> pd.DataFrame:
    salida = tabla.copy()
    especiales = decimales_columna or {}
    for columna in salida.columns:
        if columna in enteros and pd.api.types.is_numeric_dtype(salida[columna]):
            salida[columna] = salida[columna].map(
                lambda valor: "—" if pd.isna(valor) else str(int(valor))
            )
        elif columna in valores_p:
            salida[columna] = salida[columna].map(texto_p)
        elif columna in especiales and pd.api.types.is_numeric_dtype(salida[columna]):
            nd = especiales[columna]
            salida[columna] = salida[columna].map(
                lambda valor, nd=nd: "—" if pd.isna(valor) else coma(float(valor), nd)
            )
        elif pd.api.types.is_numeric_dtype(salida[columna]):
            salida[columna] = salida[columna].map(
                lambda valor, nd=decimales: "—" if pd.isna(valor) else coma(float(valor), nd)
            )
    return salida


def _meses(origen: pd.Timestamp, destino: pd.Timestamp) -> int:
    return (destino.year - origen.year) * 12 + (destino.month - origen.month)


def _figura(titulo: str, eje_y: str, alto: int = 460) -> go.Figure:
    figura = go.Figure()
    figura.update_layout(
        title=titulo,
        template="plotly_white",
        separators=",.",
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
        margin=dict(l=48, r=24, t=72, b=40),
        yaxis_title=eje_y,
        xaxis_title="Mes",
        height=alto,
    )
    return figura


def grafico_tasas(
    panel: pd.DataFrame,
    inicio,
    fin,
    con_politica: bool,
    parcial: dict,
) -> go.Figure:
    historia = recortar(panel, inicio, fin)
    figura = _figura("Tasa de crédito de consumo", "Porcentaje efectivo anual")
    if historia.empty:
        return figura
    figura.add_trace(
        go.Scatter(
            x=historia.index,
            y=historia["y"],
            name="Crédito de consumo",
            line=dict(color="#0B3A5B", width=2.2),
        )
    )
    if con_politica:
        figura.add_trace(
            go.Scatter(
                x=historia.index,
                y=historia["pol"],
                name="Tasa de política",
                line=dict(color="#A67C2D", width=2),
            )
        )
    if parcial.get("tasa_promedio") is not None and pd.Timestamp(fin).to_period("M") >= pd.Period("2026-09", "M"):
        figura.add_trace(
            go.Scatter(
                x=[pd.Timestamp("2026-10-31")],
                y=[parcial["tasa_promedio"]],
                name="Octubre 2026, parcial",
                mode="markers",
                marker=dict(symbol="diamond", size=11, color="#9C4A2B"),
            )
        )
    return figura


def grafico_agregados(panel: pd.DataFrame, inicio, fin, modo: str) -> go.Figure:
    historia = recortar(panel, inicio, fin)
    if modo == "Niveles":
        figura = _figura("M1, M2 y M3 en niveles", "Miles de millones de pesos")
        figura.update_yaxes(tickformat=",.0f")
        series = (("m1", "M1"), ("m2", "M2"), ("m3", "M3"))
    else:
        figura = _figura("Crecimiento anual de M1, M2 y M3", "100 × ln(Mₜ / Mₜ₋₁₂)")
        series = (("g_m1", "M1"), ("g_m2", "M2"), ("g_m3", "M3"))
    colores = ["#0B3A5B", "#1F6F5B", "#9C4A2B"]
    for (columna, nombre), color in zip(series, colores, strict=True):
        serie = historia[columna].dropna()
        if serie.empty:
            continue
        figura.add_trace(
            go.Scatter(x=serie.index, y=serie, name=nombre, line=dict(color=color, width=2))
        )
    return figura


def grafico_proyeccion(
    panel: pd.DataFrame,
    senda: pd.DataFrame,
    inicio,
    nombre_modelo: str,
    escenario: dict[int, float] | None,
    prediccion: str = PREDICCION_POR_DEFECTO,
) -> go.Figure:
    origen = panel.index.max()
    # Ocho años alcanzan para leer el abanico. Un inicio posterior del lateral se respeta.
    desde = max(pd.Timestamp(inicio), origen - pd.DateOffset(years=8))
    historia = panel.loc[desde:]
    tasa = float(panel["y"].iloc[-1])
    fechas = [origen, *senda["fecha"].tolist()]
    punto = [tasa, *senda["proyeccion"].tolist()]
    figura = _figura(f"Proyección · {nombre_modelo}", "Porcentaje efectivo anual")
    figura.add_trace(go.Scatter(x=fechas, y=[tasa, *senda["banda_95_superior"]], line=dict(width=0), showlegend=False, hoverinfo="skip"))
    figura.add_trace(
        go.Scatter(
            x=fechas,
            y=[tasa, *senda["banda_95_inferior"]],
            fill="tonexty",
            fillcolor="rgba(138,164,181,0.35)",
            line=dict(width=0),
            name="Banda 95 %",
            hoverinfo="skip",
        )
    )
    figura.add_trace(go.Scatter(x=fechas, y=[tasa, *senda["banda_80_superior"]], line=dict(width=0), showlegend=False, hoverinfo="skip"))
    figura.add_trace(
        go.Scatter(
            x=fechas,
            y=[tasa, *senda["banda_80_inferior"]],
            fill="tonexty",
            fillcolor="rgba(11,58,91,0.22)",
            line=dict(width=0),
            name="Banda 80 %",
            hoverinfo="skip",
        )
    )
    if not historia.empty:
        figura.add_trace(
            go.Scatter(x=historia.index, y=historia["y"], name="Tasa observada", line=dict(color="#0B3A5B", width=2.2))
        )
    ficha = PREDICCIONES[prediccion]
    if prediccion == PREDICCION_POR_DEFECTO:
        figura.add_trace(
            go.Scatter(x=fechas, y=punto, name="Predicción conservadora", line=dict(color="#9C4A2B", width=3))
        )
    else:
        figura.add_trace(
            go.Scatter(x=fechas, y=punto, name="Conservadora (centro)", line=dict(color="#6B7280", width=1.6, dash="dot"))
        )
        figura.add_trace(
            go.Scatter(
                x=fechas,
                y=[tasa, *senda[ficha["columna"]].tolist()],
                name=f"Predicción {ficha['nombre'].lower()}",
                line=dict(color="#9C4A2B", width=3),
            )
        )
    if escenario is not None:
        figura.add_trace(
            go.Scatter(
                x=fechas,
                y=[tasa, *[escenario[int(h)] for h in senda["horizonte"]]],
                name="Condiciones iniciales alteradas",
                line=dict(color="#A67C2D", width=2, dash="dot"),
            )
        )
    return figura


def tabla_descarga(senda: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Fecha": pd.to_datetime(senda["fecha"]).dt.strftime("%Y-%m-%d"),
            "Meses": senda["horizonte"].astype(int),
            "Proyección": senda["proyeccion"],
            "80 % inferior": senda["banda_80_inferior"],
            "80 % superior": senda["banda_80_superior"],
            "95 % inferior": senda["banda_95_inferior"],
            "95 % superior": senda["banda_95_superior"],
            "RMSE": senda["rmse_historico"],
            "MAE": senda["mae_historico"],
        }
    )


def pivot_rmse(metricas: pd.DataFrame, columna: str) -> pd.DataFrame:
    tabla = metricas.loc[metricas["horizonte"].isin(HORIZONTES_REPORTE)].pivot(
        index="modelo", columns="horizonte", values=columna
    )
    tabla = tabla.reindex(index=list(NOMBRES_MODELO), columns=list(HORIZONTES_REPORTE))
    tabla.index = [NOMBRES_MODELO[clave] for clave in tabla.index]
    tabla.columns = [f"{horizonte} {'mes' if horizonte == 1 else 'meses'}" for horizonte in tabla.columns]
    return tabla


def seccion_historial(panel: pd.DataFrame, parcial: dict, inicio, fin, con_politica: bool, vista: str) -> None:
    st.subheader("Historial")
    st.caption(
        "El rango cuenta por mes: cualquier día del mes muestra el cierre de ese mes. "
        "No cambia el modelo ni la proyección."
    )
    historia = recortar(panel, inicio, fin)
    if historia.empty:
        st.info("Ese rango no contiene ningún cierre mensual.")
        return
    st.plotly_chart(
        grafico_tasas(panel, inicio, fin, con_politica, parcial),
    )
    crecimiento = vista == "Crecimiento anual"
    serie_crecimiento = historia[["g_m1", "g_m2", "g_m3"]].dropna(how="all")
    if crecimiento and serie_crecimiento.empty:
        st.info(
            "El crecimiento anual empieza doce meses después del primer saldo. "
            "En esta muestra, el primer valor es el de mayo de 2003. Amplíe el rango."
        )
    else:
        st.plotly_chart(grafico_agregados(panel, inicio, fin, vista))
    st.caption(
        "Los niveles están en miles de millones de pesos. M3 es el agregado más grande "
        "y por eso marca la escala. El crecimiento es 100 × ln(Mₜ / Mₜ₋₁₂). "
        f"Octubre de 2026 promedia {coma(parcial['tasa_promedio'])} % con "
        f"{parcial['n_viernes']} viernes. Ese punto, el rombo, solo aparece si el rango "
        "llega a septiembre de 2026 y no entra al modelo."
    )


def seccion_proyeccion(
    panel: pd.DataFrame,
    proyeccion: pd.DataFrame,
    modelo_id: str,
    horizonte: int,
    inicio,
    escenario: dict[int, float] | None,
    prediccion: str = PREDICCION_POR_DEFECTO,
) -> None:
    st.subheader("Tu proyección desde septiembre de 2026")
    senda = proyeccion.loc[proyeccion["modelo"] == modelo_id].sort_values("horizonte")
    if senda.empty:
        st.error("Ese modelo no tiene una senda guardada.")
        return
    visible = senda.loc[senda["horizonte"] <= horizonte].copy()
    fila = senda.loc[senda["horizonte"] == horizonte]
    if fila.empty:
        st.error("No hay pronóstico para ese horizonte.")
        return
    fila = fila.iloc[0]
    ficha = PREDICCIONES[prediccion]
    valor_elegido = float(fila[ficha["columna"]])
    tasa_hoy = float(panel["y"].iloc[-1])
    columnas = st.columns(4)
    columnas[0].metric(
        f"Predicción {ficha['nombre'].lower()}",
        f"{coma(valor_elegido)} %",
        delta=f"{coma(valor_elegido - tasa_hoy)} pp frente a hoy",
        delta_color="inverse",
    )
    columnas[1].metric(
        "Banda 80 %",
        f"{coma(float(fila['banda_80_inferior']))} a {coma(float(fila['banda_80_superior']))}",
    )
    columnas[2].metric(
        "Banda 95 %",
        f"{coma(float(fila['banda_95_inferior']))} a {coma(float(fila['banda_95_superior']))}",
    )
    columnas[3].metric("RMSE de ese horizonte", f"{coma(float(fila['rmse_historico']), 3)} pp")
    st.plotly_chart(
        grafico_proyeccion(panel, visible, inicio, NOMBRES_MODELO[modelo_id], escenario, prediccion),
    )
    st.caption(
        f"Predicción {ficha['nombre'].lower()} a {horizonte} {'mes' if horizonte == 1 else 'meses'}: "
        f"{coma(valor_elegido)} %. {ficha['resumen']} {ficha['detalle']} "
        "Puedes cambiarla en el lateral."
    )
    st.caption(
        "El gráfico muestra los últimos ocho años, o un tramo más corto si el rango del "
        "lateral empieza después. Así las bandas no quedan reducidas a una raya al final."
    )
    if escenario is not None:
        st.caption(
            f"Con el cambio de condiciones iniciales, la tasa a {horizonte} meses queda en "
            f"{coma(escenario[horizonte])} %. La línea punteada no tiene banda: el choque "
            "no se observó en el backtest."
        )
    tabla = tabla_descarga(visible)
    st.dataframe(
        tabla_visible(
            tabla,
            decimales=2,
            enteros=("Meses",),
            decimales_columna={"RMSE": 3, "MAE": 3},
        ),
        hide_index=True,
    )
    st.download_button(
        "Descargar tu proyección (CSV)",
        data=tabla.to_csv(index=False, sep=";", decimal=",").encode("utf-8-sig"),
        file_name=f"proyeccion_{modelo_id}.csv",
        mime="text/csv",
        key="descarga_proyeccion",
    )
    st.caption(
        "El archivo usa punto y coma y coma decimal. El RMSE y el MAE históricos son "
        "los del backtest en ese horizonte, en puntos porcentuales. La banda suma al "
        "pronóstico los cuantiles del error ya realizado: 10 y 90 para el 80 %, "
        "2,5 y 97,5 para el 95 %."
    )


def seccion_desempeno(datos: dict, modelo_id: str, horizonte: int) -> None:
    st.subheader("Error fuera de muestra")
    st.markdown(
        "Misma ventana expansiva para todos: 120 meses mínimos, primer objetivo en "
        "mayo de 2012 y reajuste cada mes. La razón es el RMSE del modelo dividido "
        "por el de la tasa constante. Por debajo de 1, el modelo se equivoca menos."
    )
    metricas = datos["metricas"]
    st.markdown("**RMSE, en puntos porcentuales**")
    st.dataframe(tabla_visible(pivot_rmse(metricas, "rmse"), 3))
    st.markdown("**Razón del RMSE frente a la tasa constante**")
    st.dataframe(tabla_visible(pivot_rmse(metricas, "razon_rmse_paseo"), 2))

    st.markdown("**Referencia publicada, a tres decimales**")
    filas = []
    for h in (1, 3, 6, 12):
        filas.append(
            {
                "Horizonte": h,
                "Ridge con agregados": valor(metricas, "ridge_agregados", h),
                "Referencia con agregados": RMSE_REFERENCIA["ridge_agregados"][h],
                "Ridge sin agregados": valor(metricas, "ridge_tasa_politica", h),
                "Referencia sin agregados": RMSE_REFERENCIA["ridge_tasa_politica"][h],
                "Tasa constante": valor(metricas, "paseo_aleatorio", h),
                "Referencia constante": RMSE_REFERENCIA["paseo_aleatorio"][h],
            }
        )
    referencia = pd.DataFrame(filas)
    st.dataframe(
        tabla_visible(referencia, 3, enteros=("Horizonte",)),
        hide_index=True,
    )
    distancias = []
    for h in (1, 3, 6, 12):
        for modelo in ("ridge_agregados", "ridge_tasa_politica", "paseo_aleatorio"):
            distancias.append(abs(valor(metricas, modelo, h) - RMSE_REFERENCIA[modelo][h]))
    st.caption(
        f"La mayor distancia frente a la referencia de 1 a 12 meses es {coma(max(distancias), 3)} "
        "puntos. La tolerancia de la prueba es 0,05 y no se amplió."
    )

    elegido = metricas[
        (metricas["modelo"] == modelo_id) & (metricas["horizonte"].isin(HORIZONTES_REPORTE))
    ].sort_values("horizonte")
    detalle = elegido[
        ["horizonte", "n", "rmse", "mae", "mase", "sesgo", "dm_stat", "dm_pvalue"]
    ].rename(
        columns={
            "horizonte": "Horizonte",
            "n": "Evaluaciones",
            "rmse": "RMSE",
            "mae": "MAE",
            "mase": "MASE",
            "sesgo": "Sesgo",
            "dm_stat": "Diebold-Mariano",
            "dm_pvalue": "Valor p",
        }
    )
    st.markdown(
        f"**{NOMBRES_MODELO[modelo_id]}.** Diebold-Mariano compara el error cuadrático "
        "con la tasa constante. Un estadístico negativo favorece al modelo. En la tasa "
        "constante la comparación es contra sí misma y no se reporta."
    )
    st.dataframe(
        tabla_visible(detalle, 3, enteros=("Horizonte", "Evaluaciones"), valores_p=("Valor p",)),
        hide_index=True,
    )

    cobertura = datos["cobertura"]
    cob = cobertura[
        (cobertura["modelo"] == modelo_id) & (cobertura["horizonte"].isin(HORIZONTES_REPORTE))
    ].sort_values("horizonte")
    if not cob.empty:
        vista = cob[["horizonte", "n", "cobertura_80", "cobertura_95"]].copy()
        vista["cobertura_80"] = vista["cobertura_80"] * 100
        vista["cobertura_95"] = vista["cobertura_95"] * 100
        vista = vista.rename(
            columns={
                "horizonte": "Horizonte",
                "n": "Evaluaciones",
                "cobertura_80": "Cobertura 80 %",
                "cobertura_95": "Cobertura 95 %",
            }
        )
        st.markdown(
            "Cobertura de las bandas construidas solo con errores ya conocidos en cada origen. "
            "El nominal es 80 % y 95 %."
        )
        st.dataframe(
            tabla_visible(vista, 1, enteros=("Horizonte", "Evaluaciones")),
            hide_index=True,
        )

    comparacion = (
        metricas[metricas["horizonte"] == horizonte]
        .set_index("modelo")
        .reindex(list(NOMBRES_MODELO))["rmse"]
    )
    figura = go.Figure(
        go.Bar(
            x=[NOMBRES_MODELO[clave] for clave in comparacion.index],
            y=comparacion.to_numpy(),
            marker_color="#0B3A5B",
        )
    )
    figura.update_layout(
        title=f"RMSE a {horizonte} {'mes' if horizonte == 1 else 'meses'}",
        template="plotly_white",
        separators=",.",
        yaxis_title="Puntos porcentuales",
        height=440,
        margin=dict(l=48, r=16, t=60, b=140),
        xaxis_tickangle=-35,
    )
    st.plotly_chart(figura)
    st.download_button(
        "Descargar las métricas (CSV)",
        data=metricas.to_csv(index=False, sep=";", decimal=",").encode("utf-8-sig"),
        file_name="metricas_backtest.csv",
        mime="text/csv",
        key="descarga_metricas",
    )


def seccion_estudio(datos: dict, panel: pd.DataFrame) -> None:
    metricas = datos["metricas"]
    calidad = datos["calidad"]
    pruebas = datos["pruebas"]
    eda = datos["eda"]
    muestra = calidad["muestra"]
    principal = datos["proyeccion"]
    principal = principal.loc[principal["modelo"] == "ridge_agregados"].set_index("horizonte")

    st.subheader("Lectura")
    st.markdown(
        f"La tasa mensual del crédito de consumo cerró septiembre de 2026 en "
        f"**{coma(muestra['tasa_cierre'])} %**. El Ridge con agregados la ubica en "
        f"**{coma(float(principal.loc[1, 'proyeccion']))} %** a un mes, "
        f"**{coma(float(principal.loc[3, 'proyeccion']))} %** a tres, "
        f"**{coma(float(principal.loc[6, 'proyeccion']))} %** a seis y "
        f"**{coma(float(principal.loc[12, 'proyeccion']))} %** a doce. "
        f"A un mes el RMSE es {coma(valor(metricas, 'ridge_agregados', 1), 3)} con agregados, "
        f"{coma(valor(metricas, 'ridge_tasa_politica', 1), 3)} sin ellos y "
        f"{coma(valor(metricas, 'paseo_aleatorio', 1), 3)} con la tasa constante. "
        f"A doce meses: {coma(valor(metricas, 'ridge_agregados', 12), 3)}, "
        f"{coma(valor(metricas, 'ridge_tasa_politica', 12), 3)} y "
        f"{coma(valor(metricas, 'paseo_aleatorio', 12), 3)}."
    )

    st.subheader("Calidad de los datos")
    st.markdown(calidad["decision_frecuencia"])
    tasas = calidad["tasas_semanales"]
    politica = calidad["politica_diaria"]
    agregados = calidad["agregados_mensuales"]
    semanales = calidad["agregados_semanales"]
    parcial = calidad["parcial_octubre_2026"]
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Meses de la muestra", str(muestra["observaciones"]))
    c2.metric("Cierre de la tasa", f"{coma(muestra['tasa_cierre'])} %")
    c3.metric("Política de septiembre", f"{coma(muestra['politica_cierre'])} %")
    c4.metric("Política vigente", f"{coma(politica['ultimo_valor'])} %")
    st.markdown(
        f"La tasa semanal tiene {tasas['filas']} viernes, del {tasas['inicio']} al {tasas['fin']}, "
        f"sin duplicados y sin huecos distintos de siete días. La política diaria va del "
        f"{politica['inicio']} al {politica['fin']}. Falta un día: "
        f"{', '.join(politica['dias_faltantes']) or 'ninguno'}, fuera de la muestra. "
        f"El 12,25 % es el nivel desde el 1 de octubre de 2026, no el promedio de septiembre."
    )
    st.markdown(
        f"Los agregados mensuales cubren {agregados['filas']} cierres, del {agregados['inicio']} "
        f"al {agregados['fin']}, sin meses faltantes. La serie semanal tiene {semanales['filas']} "
        f"observaciones y {semanales['n_huecos']} saltos distintos de siete días; no entra al modelo. "
        f"La meta de inflación está vacía en {calidad['meta_nula_antes_de_1991']} meses anteriores "
        "a 1991 y está completa en la muestra de tasas. En el panel de estimación no hay nulos."
    )
    atipicos = calidad["atipicos_cambio_tasa"]
    if atipicos:
        texto = "; ".join(f"{item['fecha']} ({coma(item['cambio'])} puntos)" for item in atipicos[:8])
        resto = f" Hay {len(atipicos) - 8} casos más." if len(atipicos) > 8 else ""
        st.markdown(
            "Cambios mensuales de la tasa con puntuación robusta superior a 3,5: "
            f"{texto}.{resto} Se conservan: son saltos del ciclo, no huecos de captura."
        )
    st.markdown(
        f"Octubre de 2026 tiene {parcial['n_viernes']} viernes, del {parcial['primer_viernes']} "
        f"al {parcial['ultimo_viernes']}, y promedia {coma(parcial['tasa_promedio'])} % en consumo "
        f"y {coma(parcial['politica_promedio'])} % en política. No se usa para entrenar."
    )
    ipc = eda["ipc_contra_inflacion"]
    st.markdown(
        f"La inflación anual calculada con el IPC correlaciona {coma(ipc['correlacion'], 3)} "
        f"con la serie oficial. La diferencia absoluta máxima es {coma(ipc['max_abs'], 2)} puntos."
    )

    st.subheader("Correlaciones")
    desc = eda["descriptivos"]
    st.markdown(
        f"La tasa promedia {coma(desc['y']['media'])} % (entre {coma(desc['y']['minimo'])} y "
        f"{coma(desc['y']['maximo'])}). La política promedia {coma(desc['pol']['media'])} % y el "
        f"spread {coma(desc['spread']['media'])} puntos. El crecimiento anual medio es "
        f"{coma(desc['g_m1']['media'])} % en M1, {coma(desc['g_m2']['media'])} % en M2 y "
        f"{coma(desc['g_m3']['media'])} % en M3."
    )
    corr = eda["correlacion_monetaria"]
    st.markdown(
        f"Correlación de los crecimientos: M1–M2 {coma(corr['g_m1_g_m2'], 2)}, "
        f"M1–M3 {coma(corr['g_m1_g_m3'], 2)} y M2–M3 {coma(corr['g_m2_g_m3'], 2)}. "
        "M2 y M3 van casi juntos. El factor de inflación de la varianza lo confirma."
    )
    vif = pd.DataFrame(
        [{"Variable": ETIQUETA_FEATURE.get(nombre, nombre), "VIF": numero} for nombre, numero in pruebas["vif"].items()]
    )
    st.dataframe(tabla_visible(vif, 1), hide_index=True)
    st.caption("Con esos VIF, el coeficiente de M2 o de M3 no se lee como el efecto de ese agregado.")

    columnas = ["y", "pol", "spread", "g_m1", "g_m2", "g_m3", "inflacion", "brecha_inflacion"]
    etiquetas = ["Tasa", "Política", "Spread", "g(M1)", "g(M2)", "g(M3)", "Inflación", "Brecha"]
    matriz = panel[columnas].corr()
    heatmap = go.Figure(
        go.Heatmap(
            z=matriz.to_numpy(),
            x=etiquetas,
            y=etiquetas,
            zmin=-1,
            zmax=1,
            colorscale="Blues",
            text=[[coma(valor, 2) for valor in fila] for fila in matriz.to_numpy()],
            texttemplate="%{text}",
            colorbar_title="Correlación",
        )
    )
    heatmap.update_layout(title="Correlaciones en la muestra mensual", template="plotly_white", height=520, separators=",.")
    st.plotly_chart(heatmap)

    cruzada = pruebas["correlacion_cruzada"]
    lineas = go.Figure()
    colores = {"g_m1": "#0B3A5B", "g_m2": "#1F6F5B", "g_m3": "#9C4A2B"}
    nombres = {"g_m1": "Crecimiento de M1", "g_m2": "Crecimiento de M2", "g_m3": "Crecimiento de M3"}
    for clave in ("g_m1", "g_m2", "g_m3"):
        rezagos = sorted(int(k) for k in cruzada[clave])
        lineas.add_trace(
            go.Scatter(
                x=rezagos,
                y=[cruzada[clave][str(k)] for k in rezagos],
                name=nombres[clave],
                mode="lines+markers",
                line=dict(color=colores[clave], width=2),
            )
        )
    lineas.update_layout(
        title="Correlación de la tasa con el crecimiento rezagado",
        template="plotly_white",
        separators=",.",
        xaxis_title="Rezago del agregado, en meses",
        yaxis_title="Correlación",
        height=420,
        legend=dict(orientation="h", y=1.12),
    )
    st.plotly_chart(lineas)
    rezagos = pd.DataFrame(
        [
            {
                "Variable rezagada": nombres[clave],
                "Rezago de mayor correlación": eda["rezago_maximo"][clave]["rezago"],
                "Correlación": eda["rezago_maximo"][clave]["correlacion"],
            }
            for clave in ("g_m1", "g_m2", "g_m3")
        ]
    )
    st.dataframe(
        tabla_visible(rezagos, 2, enteros=("Rezago de mayor correlación",)),
        hide_index=True,
    )

    st.subheader("Pruebas de series")
    st.markdown(
        "ADF usa constante en tasas, crecimientos y diferencias, y constante más tendencia "
        "en los niveles de M1, M2 y M3. KPSS usa la misma especificación y statsmodels "
        "recorta su valor p al rango 0,01–0,10. «Compatible con raíz unitaria» significa "
        "que ADF no rechaza la nula al 5 % y KPSS sí rechaza la estacionariedad."
    )
    filas_raiz = []
    for clave, etiqueta in SERIES_RAIZ:
        bloque = pruebas["raices"][clave]
        adf_p = float(bloque["adf"]["valor_p"])
        kpss_p = float(bloque["kpss"]["valor_p"])
        filas_raiz.append(
            {
                "Serie": etiqueta,
                "ADF, valor p": texto_p(adf_p),
                "KPSS, valor p": texto_p(kpss_p),
                "Lectura": lectura_raiz(adf_p, kpss_p),
            }
        )
    st.dataframe(pd.DataFrame(filas_raiz), hide_index=True)
    st.markdown(
        "La tasa y los saldos monetarios se comportan como series integradas. Por eso el "
        "modelo usa el crecimiento anual y no el nivel. Los crecimientos de M2 y M3 siguen "
        "siendo persistentes."
    )

    st.markdown(
        "Granger se hace sobre la diferencia de la tasa. El valor p de la izquierda usa "
        "solo datos hasta abril de 2012, antes de la evaluación. El de la derecha usa "
        "toda la muestra y es descriptivo."
    )
    filas_g = []
    for causa, etiqueta in CAUSAS:
        for rezago in ("3", "6", "12"):
            filas_g.append(
                {
                    "Causa": etiqueta,
                    "Rezago": int(rezago),
                    "p hasta abril de 2012": texto_p(pruebas["granger"]["hasta_abril_2012"][causa][rezago]),
                    "p en toda la muestra": texto_p(pruebas["granger"]["muestra_completa"][causa][rezago]),
                }
            )
    st.dataframe(pd.DataFrame(filas_g), hide_index=True)
    st.caption("La variación de la política anticipa la de la tasa. La señal de los agregados depende del rezago.")

    eg = pruebas["engle_granger"]
    johansen = pruebas["johansen_tasa_politica"]
    johansen_m = pruebas["johansen_tasa_politica_logm2"]
    st.markdown(
        f"Engle-Granger entre la tasa y la política tiene valor p {texto_p(eg['politica']['valor_p'])}. "
        f"Entre la tasa y el logaritmo de M2, {texto_p(eg['log_m2']['valor_p'])}. "
        f"Johansen sobre tasa y política: traza {coma(johansen['traza'][0], 2)} frente a un "
        f"crítico del 5 % de {coma(johansen['critico_95'][0], 2)}. Con el logaritmo de M2 la traza "
        f"es {coma(johansen_m['traza'][0], 2)} y el crítico es {coma(johansen_m['critico_95'][0], 2)}. "
        "Al 5 % no hay cointegración. El VECM de rango 1 se dejó como contraste, no como modelo mantenido."
    )
    estacional = pruebas["estacionalidad_hasta_2012"]["valor_p"]
    st.markdown(
        f"Las dummies de mes sobre el cambio de la tasa, estimadas solo hasta abril de 2012, "
        f"tienen valor p conjunto {texto_p(estacional)}. El SARIMAX no lleva término estacional."
    )

    st.markdown("**Coeficientes del Ridge final, sobre variables estandarizadas**")
    coef = datos["coeficientes"]
    coef = coef.loc[coef["horizonte"].isin(HORIZONTES_REPORTE)]
    ancho = coef.pivot(index="horizonte", columns="variable", values="coeficiente")
    orden = ["dy3", "spread", "dpol3", "g_m1", "g_m2", "g_m3"]
    ancho = ancho[orden]
    ancho.columns = [ETIQUETA_FEATURE[col] for col in ancho.columns]
    intercepto = coef.drop_duplicates("horizonte").set_index("horizonte")["intercepto"]
    ancho.insert(0, "Intercepto", intercepto)
    ancho = ancho.reset_index().rename(columns={"horizonte": "Horizonte"})
    st.dataframe(tabla_visible(ancho, 3, enteros=("Horizonte",)), hide_index=True)
    st.caption("Los signos de los tres crecimientos no son estables. No son una elasticidad.")

    st.subheader("Residuos y regímenes")
    residuales = datos["residuales"]
    st.markdown(
        f"En el error a un mes del Ridge con agregados, Ljung-Box tiene valor p "
        f"{texto_p(residuales['ljung_box_6'])} a 6 rezagos y {texto_p(residuales['ljung_box_12'])} a 12. "
        f"Jarque-Bera tiene valor p {texto_p(residuales['jarque_bera_p'])} "
        f"(asimetría {coma(residuales['asimetria'], 2)}, curtosis {coma(residuales['curtosis'], 2)}). "
        f"El RMSE de la primera mitad de la evaluación es {coma(residuales['rmse_primera_mitad'], 2)} "
        f"y el de la segunda, {coma(residuales['rmse_segunda_mitad'], 2)}. "
        "Hay autocorrelación y colas pesadas. La banda empírica no promete la cobertura nominal."
    )
    errores = datos["predicciones"]
    errores = errores[(errores["modelo"] == "ridge_agregados") & (errores["horizonte"] == 1)]
    residuo = go.Figure()
    residuo.add_hline(y=0, line_color="#5C6B73", line_width=1)
    residuo.add_trace(
        go.Scatter(
            x=errores["fecha_objetivo"],
            y=errores["error"],
            name="Error a un mes",
            line=dict(color="#0B3A5B", width=1.4),
        )
    )
    residuo.update_layout(
        title="Error a un mes: realizada menos pronóstico",
        template="plotly_white",
        separators=",.",
        yaxis_title="Puntos porcentuales",
        xaxis_title="Mes objetivo",
        height=380,
    )
    st.plotly_chart(residuo)

    st.markdown(
        "El backtest principal empieza en mayo de 2012, así que 2008-2009 no tiene error "
        "fuera de muestra en ese diseño. La fila de 2008-2009 es un diagnóstico con el "
        "primer origen en enero de 2007 y no entra en la tabla de referencia."
    )
    regimenes = datos["regimenes"]
    interes = regimenes[
        regimenes["modelo"].isin(["ridge_agregados", "ridge_tasa_politica", "paseo_aleatorio"])
        & regimenes["horizonte"].isin([1, 12])
    ].copy()
    interes["Modelo"] = interes["modelo"].map(NOMBRES_MODELO)
    vista_reg = interes.rename(
        columns={"regimen": "Régimen", "diseno": "Diseño", "horizonte": "Horizonte", "n": "Meses", "rmse": "RMSE"}
    )[["Régimen", "Diseño", "Modelo", "Horizonte", "Meses", "RMSE"]]
    st.dataframe(
        tabla_visible(vista_reg, 2, enteros=("Horizonte", "Meses")),
        hide_index=True,
    )
    st.caption(
        "2022-2023 concentra el error: es la subida rápida de la política y de la tasa. "
        "A doce meses, en ese tramo, los agregados reducen el RMSE frente al modelo sin ellos."
    )

    st.subheader("Cuánto aportan M1, M2 y M3")
    filas_aporte = []
    for h in HORIZONTES_REPORTE:
        con = valor(metricas, "ridge_agregados", h)
        sin = valor(metricas, "ridge_tasa_politica", h)
        paseo = valor(metricas, "paseo_aleatorio", h)
        filas_aporte.append(
            {
                "Horizonte": h,
                "Reducción frente al Ridge sin agregados": sin - con,
                "Reducción frente a la tasa constante": paseo - con,
            }
        )
    st.dataframe(
        tabla_visible(pd.DataFrame(filas_aporte), 3, enteros=("Horizonte",)),
        hide_index=True,
    )
    r1 = valor(metricas, "ridge_tasa_politica", 1) - valor(metricas, "ridge_agregados", 1)
    r3 = valor(metricas, "ridge_tasa_politica", 3) - valor(metricas, "ridge_agregados", 3)
    r6 = valor(metricas, "ridge_tasa_politica", 6) - valor(metricas, "ridge_agregados", 6)
    r12 = valor(metricas, "ridge_tasa_politica", 12) - valor(metricas, "ridge_agregados", 12)
    r24 = valor(metricas, "ridge_tasa_politica", 24) - valor(metricas, "ridge_agregados", 24)
    st.markdown(
        f"A un mes la reducción es {coma(r1, 3)} puntos. A tres meses es {coma(r3, 3)}. "
        f"A seis meses es {coma(r6, 3)} y a doce, {coma(r12, 3)}. A veinticuatro meses llega "
        f"a {coma(r24, 3)} puntos: ahí el Ridge sin agregados ya no mejora a la tasa constante, "
        "y el que lleva M1, M2 y M3 sí. Los agregados aportan sobre todo desde los seis meses "
        "y casi nada al mes siguiente."
    )
    st.markdown(
        f"Añadir la inflación deja el RMSE de doce meses en "
        f"{coma(valor(metricas, 'ridge_inflacion', 12), 2)}. Añadir la brecha lo deja en "
        f"{coma(valor(metricas, 'ridge_brecha', 12), 2)}. El Ridge sin esas variables está en "
        f"{coma(valor(metricas, 'ridge_agregados', 12), 2)}. Ninguna de las dos lo reduce en "
        "los horizontes de 1, 3, 6 y 12 meses. Un componente principal de los tres crecimientos "
        f"da {coma(valor(metricas, 'pca_ridge', 12), 2)} a doce meses, frente a "
        f"{coma(valor(metricas, 'ridge_agregados', 12), 2)} de las tres series. La ganancia "
        "es la de un factor común, no la de tres señales separadas."
    )
    st.markdown(
        "Nada de esto identifica cuánto sube la tasa si crece M2. Los tres agregados se mueven "
        "juntos y el ejercicio es predictivo. El backtest es la pieza para decidir: el bloque "
        "monetario mejora el mediano plazo y no el mes siguiente."
    )

    st.subheader("Limitaciones")
    st.markdown(
        "El modelo no es una regla de política. No proyecta la senda futura de la política "
        "ni del dinero: así no usa datos que todavía no existen, y tampoco responde qué pasa "
        "si la política baja 100 puntos básicos durante el próximo año. El control de "
        "condiciones iniciales solo cambia el spread, la variación de la política o el "
        "crecimiento de M2 en septiembre de 2026 y reevalúa el mismo Ridge. La media y la "
        "desviación de cada origen salen de los pares cuyo objetivo ya se observó."
    )
    st.markdown(
        "Las bandas heredan 2020-2023 y son anchas. 2008-2009 no valida el diseño principal. "
        "Octubre de 2026 está incompleto. La frecuencia semanal de los agregados no se modeló."
    )

    st.subheader("Gráficos del estudio")
    st.caption("Los mismos archivos que acompañan el cálculo, visibles aquí.")
    columnas_img = st.columns(2)
    for i, (nombre, titulo) in enumerate(GRAFICOS):
        ruta = MEDIA / nombre
        if ruta.is_file():
            columnas_img[i % 2].image(str(ruta), caption=titulo, width="stretch")
        else:
            columnas_img[i % 2].warning(f"No está el archivo {nombre}.")


def controles_escenario(panel: pd.DataFrame, modelo_id: str) -> dict[int, float] | None:
    with st.expander("Condiciones iniciales de septiembre de 2026"):
        st.markdown(
            "Cambia solo ese mes en el Ridge con agregados: el spread, la variación a tres "
            "meses de la política y, si se pide, el crecimiento de M2. No inventa la política "
            "ni el dinero de los meses siguientes y no reestima con datos futuros."
        )
        activo = modelo_id == "ridge_agregados"
        if not activo:
            st.info("Este control actúa cuando el modelo elegido es el Ridge con agregados.")
        delta_pb = st.slider(
            "Cambio de la tasa de política en el origen (puntos básicos)",
            min_value=-200,
            max_value=200,
            value=0,
            step=25,
            disabled=not activo,
        )
        reemplazar_m2 = st.checkbox(
            "Reemplazar el crecimiento anual de M2 en el origen",
            value=False,
            disabled=not activo,
        )
        crecimiento = None
        if reemplazar_m2:
            crecimiento = st.slider(
                "Crecimiento anual de M2 en el origen (%)",
                min_value=-5.0,
                max_value=30.0,
                value=float(panel["g_m2"].iloc[-1]),
                step=0.5,
                disabled=not activo,
            )
        if activo and (delta_pb != 0 or crecimiento is not None):
            return proyectar_escenario(
                panel,
                delta_politica_pb=float(delta_pb),
                crecimiento_m2=None if crecimiento is None else float(crecimiento),
            )
    return None


def main() -> None:
    st.title(NOMBRE_PROYECTO)
    st.caption(LEMA_PROYECTO)

    faltan = [
        nombre
        for nombre in ("proyeccion.csv", "metricas.csv", "pruebas.json", "calidad.json", "eda.json", "predicciones.csv")
        if not (DATOS_PROCESADOS / nombre).is_file()
    ]
    if faltan:
        st.error(
            "Faltan resultados en tus datos: " + ", ".join(faltan) + ". "
            "Desde la carpeta del proyecto ejecuta `python3 -m src.analisis`."
        )
        st.stop()

    panel = cargar_muestra()
    parcial = cargar_parcial()
    datos = cargar_resultados()
    ids = [clave for clave, _ in SECCIONES]
    etiquetas = [etiqueta for _, etiqueta in SECCIONES]
    if "seccion_visible" not in st.session_state:
        pedido = st.query_params.get("seccion", "historial")
        if isinstance(pedido, list):
            pedido = pedido[0]
        st.session_state["seccion_visible"] = (
            etiquetas[ids.index(pedido)] if pedido in ids else etiquetas[0]
        )

    seccion = st.radio(
        "Sección",
        etiquetas,
        key="seccion_visible",
        horizontal=True,
    )

    with st.sidebar:
        st.header("Tus datos")
        prediccion = st.radio(
            "Predicción",
            list(PREDICCIONES),
            index=list(PREDICCIONES).index(PREDICCION_POR_DEFECTO),
            format_func=lambda clave: PREDICCIONES[clave]["nombre"],
            horizontal=True,
            help=(
                "Elige una sola predicción. Optimista: la tasa termina en la parte baja de lo "
                "probable. Conservadora: lo más probable. Pesimista: la parte alta."
            ),
        )
        modelo_id = st.selectbox("Modelo", list(NOMBRES_MODELO), format_func=lambda clave: NOMBRES_MODELO[clave])
        modo = st.radio("Definir el horizonte", ["Meses", "Fecha final"], horizontal=True)
        if modo == "Meses":
            horizonte = int(st.slider("Meses hacia adelante", 1, 24, 12))
        else:
            fecha_final = st.date_input(
                "Fecha final de la proyección",
                value=pd.Timestamp("2027-09-30").date(),
                min_value=pd.Timestamp("2026-10-31").date(),
                max_value=pd.Timestamp("2028-09-30").date(),
            )
            horizonte = min(24, max(1, _meses(panel.index.max(), pd.Timestamp(fecha_final))))
            st.caption(f"Equivale a {horizonte} meses desde septiembre de 2026.")
        rango = st.slider(
            "Rango del historial",
            min_value=panel.index.min().date(),
            max_value=panel.index.max().date(),
            value=(panel.index.min().date(), panel.index.max().date()),
        )
        con_politica = st.checkbox("Superponer la tasa de política", value=True)
        vista = st.radio("Agregados en el historial", ["Niveles", "Crecimiento anual"], horizontal=True)
        st.caption("El rango y la vista no cambian tu proyección.")

    nuevo = ids[etiquetas.index(seccion)]
    if st.query_params.get("seccion") != nuevo:
        st.query_params["seccion"] = nuevo

    inicio, fin = rango
    if seccion == "Historial":
        seccion_historial(panel, parcial, inicio, fin, con_politica, vista)
    elif seccion == "Proyección":
        escenario = controles_escenario(panel, modelo_id)
        seccion_proyeccion(panel, datos["proyeccion"], modelo_id, horizonte, inicio, escenario, prediccion)
    elif seccion == "Desempeño":
        seccion_desempeno(datos, modelo_id, horizonte)
    else:
        seccion_estudio(datos, panel)

    st.caption(AVISO)
    st.caption(DERECHOS)


if __name__ == "__main__":
    main()
else:
    main()
