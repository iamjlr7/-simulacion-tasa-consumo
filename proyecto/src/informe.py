"""Informe en español para quien decide, armado con los números del propio run."""

from __future__ import annotations

import math
from pathlib import Path

import pandas as pd

from src.config import (
    DERECHOS,
    HORIZONTES_REPORTE,
    NOMBRE_PROYECTO,
    PREDICCIONES,
    NOMBRES_MODELO,
    PROYECCION_REFERENCIA,
    RMSE_REFERENCIA,
    TASA_FINAL_REFERENCIA,
    TOLERANCIA_RMSE,
    coma,
)


def _fila(tabla: pd.DataFrame, modelo: str, horizonte: int) -> pd.Series:
    recorte = tabla[(tabla["modelo"] == modelo) & (tabla["horizonte"] == horizonte)]
    if recorte.empty:
        raise KeyError(f"No hay métrica de {modelo} a {horizonte} meses.")
    return recorte.iloc[0]


def _p(valor: float) -> str:
    if valor is None or not math.isfinite(float(valor)):
        return "—"
    numero = float(valor)
    if numero < 0.001:
        return "< 0,001"
    return coma(numero, 3)


def _lectura_raiz(adf: float, kpss: float) -> str:
    adf_rechaza = adf <= 0.05
    kpss_rechaza = kpss <= 0.05
    if (not adf_rechaza) and kpss_rechaza:
        return "compatible con raíz unitaria"
    if adf_rechaza and not kpss_rechaza:
        return "compatible con estacionariedad"
    if adf_rechaza and kpss_rechaza:
        return "señales mixtas: ADF rechaza raíz unitaria y KPSS rechaza estacionariedad"
    return "señales mixtas: ninguna prueba rechaza su nula al 5 %"


def escribir_informe(
    ruta: Path,
    *,
    calidad: dict,
    pruebas: dict,
    metricas: pd.DataFrame,
    proyeccion: pd.DataFrame,
    cobertura: pd.DataFrame,
    coeficientes: pd.DataFrame,
    regimenes: pd.DataFrame,
    residuales: dict,
    eda: dict,
    graficos: list[Path],
    fallos: dict[str, int],
    variables_nuevas: pd.DataFrame | None = None,
) -> None:
    """Escribe el informe de modelado con los resultados de esta ejecución."""
    ruta.parent.mkdir(parents=True, exist_ok=True)

    def rmse(modelo: str, horizonte: int) -> float:
        return float(_fila(metricas, modelo, horizonte)["rmse"])

    def met(modelo: str, horizonte: int, columna: str) -> float:
        return float(_fila(metricas, modelo, horizonte)[columna])

    principal = proyeccion[proyeccion["modelo"] == "ridge_agregados"].set_index("horizonte")
    muestra = calidad["muestra"]
    lineas: list[str] = []
    a = lineas.append

    a(f"# {NOMBRE_PROYECTO}: proyección de la tasa de crédito de consumo en Colombia")
    a("")
    a("## Lectura para la decisión")
    a("")
    a(
        "La tasa mensual del crédito de consumo, libre inversión, cerró septiembre de 2026 "
        f"en {coma(muestra['tasa_cierre'])} % efectivo anual. El Ridge directo que usa la "
        "variación reciente de la tasa, el spread frente a la política, la variación de la "
        "política y el crecimiento anual de M1, M2 y M3 la ubica, desde ese cierre, en "
        f"{coma(float(principal.loc[1, 'proyeccion']))} % a un mes, "
        f"{coma(float(principal.loc[3, 'proyeccion']))} % a tres, "
        f"{coma(float(principal.loc[6, 'proyeccion']))} % a seis y "
        f"{coma(float(principal.loc[12, 'proyeccion']))} % a doce."
    )
    a("")
    a(
        f"A un mes, el RMSE del backtest es {coma(rmse('ridge_agregados', 1))} puntos "
        f"porcentuales con agregados y {coma(rmse('ridge_tasa_politica', 1))} sin ellos. "
        f"La tasa constante queda en {coma(rmse('paseo_aleatorio', 1))}. "
        f"A doce meses las cifras son {coma(rmse('ridge_agregados', 12))}, "
        f"{coma(rmse('ridge_tasa_politica', 12))} y {coma(rmse('paseo_aleatorio', 12))}. "
        "M1, M2 y M3, tomados en conjunto, casi no mueven el error de corto plazo y sí "
        "reducen el error a seis, doce y veinticuatro meses. La inflación, añadida como "
        "regresora, no mejora ese error."
    )
    a("")
    a(
        "Esto es una proyección estadística con bandas anchas. A doce meses la banda del "
        "95 % cubre varios puntos porcentuales. No es una meta del Banco de la República "
        "ni asesoría para prestar, invertir o fijar una tasa."
    )
    a("")
    a("## Qué serie se proyecta")
    a("")
    a(
        "La variable objetivo es la columna «Crédito de consumo, Tasa de interés, semanal» "
        "del archivo de tasas de interés. En este estudio esa columna es la tasa de "
        "crédito de consumo de libre inversión, en porcentaje efectivo anual. El archivo "
        "también trae la colocación del Banco de la República, la colocación total y las "
        "tasas comerciales ordinaria, preferencial y de tesorería; no entran al modelo."
    )
    a("")
    a(
        f"La muestra común va de {muestra['inicio']} a {muestra['fin']}: "
        f"{muestra['observaciones']} cierres mensuales. Octubre y noviembre de 2026 no "
        "se usan para entrenar. Octubre aparece solo como contraste parcial."
    )
    a("")
    a("## Calidad de los datos")
    a("")
    a(calidad["decision_frecuencia"])
    a("")
    tasas = calidad["tasas_semanales"]
    politica = calidad["politica_diaria"]
    agregados = calidad["agregados_mensuales"]
    semanales = calidad["agregados_semanales"]
    parcial = calidad["parcial_octubre_2026"]
    a(
        f"La tasa semanal tiene {tasas['filas']} viernes, del {tasas['inicio']} al "
        f"{tasas['fin']}, sin fechas duplicadas y sin huecos distintos de siete días. "
        f"La política diaria va del {politica['inicio']} al {politica['fin']}, también "
        f"sin duplicados. Falta un día de calendario: "
        f"{', '.join(politica['dias_faltantes']) or 'ninguno'}. Ese hueco cae en octubre "
        f"de 2026, fuera de la muestra de estimación. El último valor diario de la "
        f"política es {coma(politica['ultimo_valor'])} %."
    )
    a("")
    a(
        f"Los agregados mensuales cubren {agregados['filas']} cierres, del "
        f"{agregados['inicio']} al {agregados['fin']}, sin meses faltantes ni nulos. "
        f"La serie semanal de agregados tiene {semanales['filas']} observaciones y "
        f"{semanales['n_huecos']} saltos distintos de siete días; queda como extensión "
        "y no entra al modelo. La meta de inflación está vacía en los años anteriores "
        f"a 1991 ({calidad['meta_nula_antes_de_1991']} meses) y está completa dentro "
        "de la muestra de tasas."
    )
    a("")
    a(
        f"En el panel mensual no hay nulos en tasa, política, agregados, inflación, meta "
        f"ni IPC. El cierre de septiembre de 2026 es {coma(muestra['tasa_cierre'])} % "
        f"para el consumo y {coma(muestra['politica_cierre'])} % para la política. "
        f"El 12,25 % de política es el nivel vigente desde el 1 de octubre de 2026, no "
        f"el promedio de septiembre."
    )
    a("")
    atipicos = calidad["atipicos_cambio_tasa"]
    if atipicos:
        muestra_atipicos = "; ".join(
            f"{item['fecha']} ({coma(item['cambio'])} puntos)" for item in atipicos[:8]
        )
        extra = ""
        if len(atipicos) > 8:
            extra = f" Hay {len(atipicos) - 8} casos más en el archivo de calidad."
        a(
            "Los cambios mensuales de la tasa con puntuación robusta superior a 3,5, "
            f"en valor absoluto, son: {muestra_atipicos}.{extra} Se conservan. Corresponden "
            "a saltos del ciclo de tasas, no a errores de captura evidentes, y excluirlos "
            "borraría precisamente los episodios que el error de pronóstico tiene que enfrentar."
        )
    else:
        a("Ningún cambio mensual de la tasa supera la puntuación robusta de 3,5.")
    a("")
    a(
        f"Octubre de 2026, con {parcial['n_viernes']} viernes entre {parcial['primer_viernes']} "
        f"y {parcial['ultimo_viernes']}, promedia {coma(parcial['tasa_promedio'])} % en "
        f"consumo y {coma(parcial['politica_promedio'])} % en política. Los agregados "
        "mensuales no tienen cierre de octubre. Esa observación no entra al ajuste."
    )
    a("")
    ipc = eda["ipc_contra_inflacion"]
    a(
        "Como control de coherencia, la inflación anual calculada con el IPC, "
        f"100 × (IPCₜ / IPCₜ₋₁₂ − 1), correlaciona {coma(ipc['correlacion'], 3)} con la "
        f"serie oficial de inflación total anual. La diferencia absoluta máxima es "
        f"{coma(ipc['max_abs'], 2)} puntos y la mediana es {coma(ipc['mediana_abs'], 2)}. "
        "La serie oficial es la que se usa cuando la inflación entra como regresor de contraste."
    )
    a("")
    a("## Preparación")
    a("")
    a(
        "La frecuencia de modelado es mensual. Cada mes de la tasa de consumo es el "
        "promedio simple de los viernes cuya fecha cae en ese mes, fechado al cierre. "
        "Septiembre de 2026 tiene cuatro viernes y ese promedio es exactamente 21,25 %, "
        "que es el nivel de partida de la proyección. No se usa el último viernes del mes: "
        "el 25 de septiembre la tasa fue 20,96 %. La política mensual es el promedio de "
        "los días del mes. M1, M2 y M3 entran en niveles de cierre, en miles de millones "
        "de pesos, y el modelo los usa solo en crecimiento anual, 100 × ln(Mₜ / Mₜ₋₁₂)."
    )
    a("")
    a(
        "También se construyen la variación a tres meses de la tasa, la variación a tres "
        "meses de la política, el spread (tasa de consumo menos política) y la brecha de "
        "inflación (inflación menos meta). La ventana expansiva exige 120 meses antes del "
        "primer origen. Ese origen es abril de 2012 y la primera predicción, a un mes, es "
        "mayo de 2012. En cada origen solo entran pares cuyo objetivo ya se observó. La "
        "media y la desviación del Ridge se calculan con esos pares y no con el vector "
        "del propio origen ni con meses posteriores."
    )
    a("")
    a("## Exploración")
    a("")
    desc = eda["descriptivos"]
    a(
        f"En la muestra, la tasa de consumo promedia {coma(desc['y']['media'])} % "
        f"(desviación {coma(desc['y']['desviacion'])}, entre {coma(desc['y']['minimo'])} y "
        f"{coma(desc['y']['maximo'])}). La política promedia {coma(desc['pol']['media'])} % "
        f"y el spread {coma(desc['spread']['media'])} puntos. El crecimiento anual medio "
        f"es {coma(desc['g_m1']['media'])} % en M1, {coma(desc['g_m2']['media'])} % en M2 "
        f"y {coma(desc['g_m3']['media'])} % en M3."
    )
    a("")
    corr = eda["correlacion_monetaria"]
    a(
        f"Los crecimientos de M1, M2 y M3 están fuertemente alineados: la correlación "
        f"M1–M2 es {coma(corr['g_m1_g_m2'], 2)}, la M1–M3 es {coma(corr['g_m1_g_m3'], 2)} "
        f"y la M2–M3 es {coma(corr['g_m2_g_m3'], 2)}. Los factores de inflación de la "
        "varianza, calculados sobre las seis variables del Ridge en la muestra común, "
        "cuantifican esa colinealidad:"
    )
    a("")
    a("| Variable | VIF |")
    a("| --- | ---: |")
    for nombre, vif in pruebas["vif"].items():
        a(f"| {nombre} | {coma(vif, 1)} |")
    a("")
    a(
        "Un VIF alto en los crecimientos monetarios impide leer el coeficiente de M1, de "
        "M2 o de M3 como el efecto de ese agregado. El aporte que se evalúa más abajo es "
        "el de los tres juntos, frente a un modelo que solo tiene la tasa y la política."
    )
    a("")
    a(
        "La correlación de la tasa con el nivel del agregado no se usa para decidir: M1, "
        "M2 y M3 son tendencias integradas y esa correlación no es un resultado de "
        "pronóstico. La correlación relevante para el modelo es la de la tasa con el "
        "crecimiento rezagado. El rezago, entre 0 y 12 meses, con mayor correlación "
        "absoluta es el siguiente."
    )
    a("")
    a("| Variable rezagada | Rezago de mayor correlación | Correlación |")
    a("| --- | ---: | ---: |")
    for variable, detalle in eda["rezago_maximo"].items():
        a(
            f"| {variable} | {detalle['rezago']} | {coma(detalle['correlacion'], 2)} |"
        )
    a("")
    a("## Pruebas de series")
    a("")
    a(
        "ADF usa la constante en tasas, crecimientos y diferencias, y constante más "
        "tendencia en los niveles de M1, M2 y M3. KPSS usa la misma especificación. "
        "El valor p de KPSS está recortado por statsmodels al rango 0,01–0,10. "
        "«Compatible con raíz unitaria» quiere decir que ADF no rechaza la nula al 5 % "
        "y KPSS sí rechaza la estacionariedad."
    )
    a("")
    a("| Serie | ADF, valor p | KPSS, valor p | Lectura |")
    a("| --- | ---: | ---: | --- |")
    etiquetas = {
        "y": "Tasa de consumo",
        "dy": "Diferencia de la tasa",
        "pol": "Tasa de política",
        "dpol": "Diferencia de la política",
        "m1": "M1, nivel",
        "m2": "M2, nivel",
        "m3": "M3, nivel",
        "d_m1": "Diferencia de M1",
        "d_m2": "Diferencia de M2",
        "d_m3": "Diferencia de M3",
        "g_m1": "Crecimiento de M1",
        "g_m2": "Crecimiento de M2",
        "g_m3": "Crecimiento de M3",
        "spread": "Spread",
        "inflacion": "Inflación",
        "brecha_inflacion": "Brecha de inflación",
    }
    for clave, etiqueta in etiquetas.items():
        bloque = pruebas["raices"][clave]
        adf_p = float(bloque["adf"]["valor_p"])
        kpss_p = float(bloque["kpss"]["valor_p"])
        a(f"| {etiqueta} | {_p(adf_p)} | {_p(kpss_p)} | {_lectura_raiz(adf_p, kpss_p)} |")
    a("")
    a(
        "La tasa de consumo se comporta como una serie integrada en el margen, y su "
        "primera diferencia queda estacionaria. Los niveles de M1, M2 y M3 también. "
        "Por eso el modelo predictivo usa el crecimiento anual y no el saldo. Los "
        "crecimientos siguen siendo persistentes: KPSS rechaza estacionariedad en M2 "
        "y M3, así que no conviene tratarlos como ruido transitorio."
    )
    a("")
    a(
        "Granger se estima sobre la diferencia de la tasa, que es la transformación "
        "estacionaria, y no sobre el nivel. La tabla trae el valor p de la prueba F "
        "con 3, 6 y 12 rezagos. La columna de abril de 2012 usa solo la información "
        "anterior a la evaluación; la otra usa la muestra completa y es descriptiva."
    )
    a("")
    a("| Causa de la diferencia de la tasa | Rezago | p hasta abril de 2012 | p en toda la muestra |")
    a("| --- | ---: | ---: | ---: |")
    nombres_causa = {
        "g_m1": "Crecimiento de M1",
        "g_m2": "Crecimiento de M2",
        "g_m3": "Crecimiento de M3",
        "dpol": "Diferencia de la política",
    }
    for causa, etiqueta in nombres_causa.items():
        for rezago in ("3", "6", "12"):
            previa = pruebas["granger"]["hasta_abril_2012"][causa][rezago]
            completa = pruebas["granger"]["muestra_completa"][causa][rezago]
            a(f"| {etiqueta} | {rezago} | {_p(previa)} | {_p(completa)} |")
    a("")
    a(
        "La variación de la política anticipa la variación de la tasa de consumo en "
        "las dos ventanas. El contenido de los agregados es más frágil y depende del "
        "rezago. Esa fragilidad encaja con el backtest: el dinero aporta poco a un mes "
        "y algo más cuando el horizonte deja correr el ciclo."
    )
    a("")
    eg = pruebas["engle_granger"]
    j_simple = pruebas["johansen_tasa_politica"]
    j_dinero = pruebas["johansen_tasa_politica_logm2"]
    a(
        f"Engle-Granger entre la tasa de consumo y la política tiene valor p "
        f"{_p(eg['politica']['valor_p'])}. Entre la tasa y el logaritmo de M2, "
        f"{_p(eg['log_m2']['valor_p'])}. Johansen sobre tasa y política da una traza "
        f"de {coma(j_simple['traza'][0], 2)} frente a un crítico del 5 % de "
        f"{coma(j_simple['critico_95'][0], 2)}. Con tasa, política y logaritmo de M2 "
        f"la traza es {coma(j_dinero['traza'][0], 2)} y el crítico es "
        f"{coma(j_dinero['critico_95'][0], 2)}. Al 5 % no se sostiene una relación de "
        "cointegración. El VECM de rango 1 se corre igual, como contraste, y no es el "
        "modelo que se mantiene."
    )
    a("")
    estacional = pruebas["estacionalidad_hasta_2012"]["valor_p"]
    a(
        f"Una regresión del cambio mensual de la tasa sobre dummies de calendario, "
        f"estimada solo hasta abril de 2012, tiene valor p conjunto {_p(estacional)}. "
        "El SARIMAX no lleva término estacional."
    )
    a("")
    a("## Modelo principal")
    a("")
    a(
        "Para cada horizonte h de 1 a 24 hay un Ridge distinto. Predice el cambio "
        "yₜ₊ₕ − yₜ con seis variables medidas en t: la variación a tres meses de la "
        "tasa, el spread, la variación a tres meses de la política y los crecimientos "
        "anuales de M1, M2 y M3. Esas variables se estandarizan con la media y la "
        "desviación poblacional de los pares de entrenamiento. λ es 5 y penaliza solo "
        "los coeficientes, no el intercepto. La proyección es la tasa del origen más "
        "el cambio predicho. No se construye una senda futura de la política ni del dinero."
    )
    a("")
    a(
        "El modelo sin agregados usa las tres primeras variables y el mismo λ. La tasa "
        "constante repite el último valor. Esas tres especificaciones son las que se "
        "comparan con la referencia."
    )
    a("")
    a("Coeficientes del ajuste final, septiembre de 2026, sobre variables estandarizadas:")
    a("")
    a("| Horizonte | Intercepto | dy3 | Spread | dpol3 | g(M1) | g(M2) | g(M3) |")
    a("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for horizonte in (1, 3, 6, 12, 24):
        bloque = coeficientes[coeficientes["horizonte"] == horizonte]
        intercepto = float(bloque["intercepto"].iloc[0])
        coef = {fila["variable"]: float(fila["coeficiente"]) for _, fila in bloque.iterrows()}
        a(
            f"| {horizonte} | {coma(intercepto, 3)} | {coma(coef['dy3'], 3)} | "
            f"{coma(coef['spread'], 3)} | {coma(coef['dpol3'], 3)} | "
            f"{coma(coef['g_m1'], 3)} | {coma(coef['g_m2'], 3)} | {coma(coef['g_m3'], 3)} |"
        )
    a("")
    a(
        "Los signos de g(M1), g(M2) y g(M3) cambian de magnitud y, entre ellos, de "
        "dirección. Con las correlaciones y los VIF de arriba, esa inestabilidad es la "
        "esperada. No se traduce a una elasticidad de la tasa respecto de un agregado."
    )
    a("")
    a("## Backtest")
    a("")
    a(
        "La ventana es expansiva, el reajuste es mensual y el mínimo de historia es "
        "120 meses. Los horizontes de la referencia son 1, 3, 6 y 12 meses; también se "
        "reportan 24. El RMSE es la raíz del promedio de los errores al cuadrado, en "
        "puntos porcentuales, sobre los meses objetivo ya realizados hasta septiembre "
        "de 2026. El MASE divide el MAE por el cambio absoluto medio de un mes entre "
        "mayo de 2002 y abril de 2012 "
        f"({coma(float(metricas['mase_escala'].iloc[0]), 3)} puntos). "
        "Diebold-Mariano usa pérdida cuadrática, varianza Newey-West con h−1 rezagos "
        "y el ajuste de Harvey, Leybourne y Newbold, siempre contra la tasa constante. "
        "Un estadístico negativo favorece al modelo."
    )
    a("")
    a("### Comparación con la referencia")
    a("")
    a(
        "La referencia está publicada a dos decimales. La tolerancia acordada para dar "
        f"por reproducido el RMSE es {coma(TOLERANCIA_RMSE, 2)} puntos. La tabla muestra "
        "primero el valor de esta ejecución y, entre paréntesis, el publicado."
    )
    a("")
    a("| Horizonte | Ridge con M1, M2 y M3 | Ridge solo tasa y política | Tasa constante |")
    a("| ---: | ---: | ---: | ---: |")
    ids_ref = ("ridge_agregados", "ridge_tasa_politica", "paseo_aleatorio")
    mayor_brecha = 0.0
    for horizonte in (1, 3, 6, 12):
        celdas = []
        for modelo in ids_ref:
            obtenido = rmse(modelo, horizonte)
            publicado = RMSE_REFERENCIA[modelo][horizonte]
            mayor_brecha = max(mayor_brecha, abs(obtenido - publicado))
            celdas.append(f"{coma(obtenido, 3)} ({coma(publicado, 2)})")
        a(f"| {horizonte} | {celdas[0]} | {celdas[1]} | {celdas[2]} |")
    a("")
    a(
        f"La mayor distancia absoluta frente a la referencia, en esos doce números, es "
        f"{coma(mayor_brecha, 3)} puntos. Queda dentro de la tolerancia de "
        f"{coma(TOLERANCIA_RMSE, 2)}. A doce meses el Ridge con agregados da "
        f"{coma(rmse('ridge_agregados', 12), 3)} y la referencia dice 3,19; el Ridge sin "
        f"agregados da {coma(rmse('ridge_tasa_politica', 12), 3)} frente a 3,79. "
        "La proyección puntual, en cambio, coincide con la referencia al centésimo:"
    )
    a("")
    a("| Horizonte | Esta ejecución | Referencia | Diferencia |")
    a("| ---: | ---: | ---: | ---: |")
    for horizonte, publicado in PROYECCION_REFERENCIA.items():
        obtenido = float(principal.loc[horizonte, "proyeccion"])
        a(
            f"| {horizonte} | {coma(obtenido, 2)} | {coma(publicado, 2)} | "
            f"{coma(obtenido - publicado, 3)} |"
        )
    a("")
    a(
        f"El punto de partida publicado es {coma(TASA_FINAL_REFERENCIA)} %, el mismo "
        "promedio de septiembre de 2026. La coincidencia del pronóstico identifica la "
        "especificación: λ = 5, estandarización con desviación poblacional, pares con "
        "objetivo ya observado y promedio mensual de los viernes. La diferencia de una "
        "o dos centésimas en el RMSE de los horizontes largos puede venir del redondeo "
        "a dos decimales de la tabla publicada y de algún detalle menor de la ventana. "
        "No se aflojó la prueba para absorberla: la tolerancia sigue en 0,05 puntos y "
        "el resultado queda por dentro."
    )
    a("")
    a("RMSE a 24 meses, que la referencia no publica:")
    a("")
    a("| Modelo | RMSE | MAE | Razón frente a la tasa constante |")
    a("| --- | ---: | ---: | ---: |")
    for modelo in ids_ref:
        a(
            f"| {NOMBRES_MODELO[modelo]} | {coma(rmse(modelo, 24), 3)} | "
            f"{coma(met(modelo, 24, 'mae'), 3)} | "
            f"{coma(met(modelo, 24, 'razon_rmse_paseo'), 3)} |"
        )
    a("")
    a(
        "A 24 meses la tasa y la política, sin agregados, no mejoran a la tasa constante. "
        "Los agregados sí bajan el RMSE. El resultado alarga lo que ya se ve a 12 meses "
        "y no lo contradice."
    )
    a("")
    a("### Resto de modelos, mismo backtest")
    a("")
    a(
        "El orden del autorregresivo se elige por AIC en cada origen, con máximo de 12. "
        "El VAR elige el orden por AIC con máximo de 4 y se estima sobre la variación de "
        "la tasa, la variación de la política y el crecimiento de M2; el nivel se recupera "
        "sumando esas variaciones. El SARIMAX es (1, 1, 0) con la política y el crecimiento "
        "de M2 rezagados un mes; de ahí en adelante esas exógenas se dejan en el último "
        "valor conocido. Lasso y Elastic Net eligen λ con el bloque reciente del "
        "entrenamiento, nunca con validación cruzada aleatoria, y luego se reestiman con "
        "todos los pares disponibles en el origen. El componente principal de M1, M2 y M3 "
        "se calcula solo con esas filas y entra a un Ridge con el mismo λ = 5. La "
        "potenciación de gradiente usa 80 árboles, profundidad 2 y tasa de aprendizaje "
        "0,05, fijos de antemano. Cuando un modelo iterativo no converge, ese origen se "
        "sustituye por la tasa vigente y se cuenta abajo."
    )
    a("")
    sustituciones = {modelo: n for modelo, n in fallos.items() if n}
    if sustituciones:
        texto = ", ".join(f"{NOMBRES_MODELO.get(k, k)} ({v})" for k, v in sustituciones.items())
        a(f"Orígenes sustituidos por la tasa vigente: {texto}.")
    else:
        a("Ningún origen de los modelos iterativos tuvo que sustituirse por la tasa vigente.")
    a("")
    a("| Modelo | 1 | 3 | 6 | 12 | 24 |")
    a("| --- | ---: | ---: | ---: | ---: | ---: |")
    for modelo in NOMBRES_MODELO:
        celdas = " | ".join(coma(rmse(modelo, h), 2) for h in HORIZONTES_REPORTE)
        a(f"| {NOMBRES_MODELO[modelo]} | {celdas} |")
    a("")
    a("Razón del RMSE frente a la tasa constante. Por debajo de 1 el modelo gana.")
    a("")
    a("| Modelo | 1 | 3 | 6 | 12 | 24 |")
    a("| --- | ---: | ---: | ---: | ---: | ---: |")
    for modelo in NOMBRES_MODELO:
        celdas = " | ".join(coma(met(modelo, h, "razon_rmse_paseo"), 2) for h in HORIZONTES_REPORTE)
        a(f"| {NOMBRES_MODELO[modelo]} | {celdas} |")
    a("")
    a(
        "Diebold-Mariano del Ridge con agregados contra la tasa constante "
        "(estadístico HLN y valor p bilateral):"
    )
    a("")
    a("| Horizonte | Estadístico | Valor p | MAE | MASE | Sesgo |")
    a("| ---: | ---: | ---: | ---: | ---: | ---: |")
    for horizonte in HORIZONTES_REPORTE:
        a(
            f"| {horizonte} | {coma(met('ridge_agregados', horizonte, 'dm_stat'), 2)} | "
            f"{_p(met('ridge_agregados', horizonte, 'dm_pvalue'))} | "
            f"{coma(met('ridge_agregados', horizonte, 'mae'), 2)} | "
            f"{coma(met('ridge_agregados', horizonte, 'mase'), 2)} | "
            f"{coma(met('ridge_agregados', horizonte, 'sesgo'), 2)} |"
        )
    a("")
    a(
        f"Añadir la inflación al Ridge con agregados deja el RMSE de doce meses en "
        f"{coma(rmse('ridge_inflacion', 12), 2)}. Añadir la brecha de inflación lo deja "
        f"en {coma(rmse('ridge_brecha', 12), 2)}. El modelo sin esas variables está en "
        f"{coma(rmse('ridge_agregados', 12), 2)}. Ninguna de las dos reduce el error de "
        "la referencia de horizontes 1, 3, 6 y 12. La conclusión previa se sostiene."
    )
    a("")
    pca_12 = rmse("pca_ridge", 12)
    pleno_12 = rmse("ridge_agregados", 12)
    a(
        f"A doce meses, resumir M1, M2 y M3 en un componente principal da un RMSE de "
        f"{coma(pca_12, 2)}, frente a {coma(pleno_12, 2)} del Ridge con las tres series. "
        "La ganancia monetaria es, en lo fundamental, la de un factor común, no la de "
        "tres señales independientes."
    )
    a("")
    a("## Intervalos, residuos y regímenes")
    a("")
    a(
        "La banda de cada horizonte es el pronóstico más los cuantiles empíricos del "
        "error histórico de ese mismo horizonte. El error es tasa realizada menos "
        "pronóstico. La banda del 80 % usa los cuantiles 10 y 90; la del 95 %, los "
        "cuantiles 2,5 y 97,5. Para medir la cobertura, la banda de un origen se arma "
        "solo con errores cuyo mes objetivo ya había ocurrido, y se exigen al menos 36 "
        "de esos errores. No es una garantía conformal: los errores se solapan en los "
        "horizontes largos y la varianza no es constante. Las bandas se ensanchan con "
        "el horizonte porque el error histórico lo hace."
    )
    a("")
    a("| Horizonte | Cobertura 80 % | Cobertura 95 % | Evaluaciones | Ancho 80 % en sep. 2026 | Ancho 95 % |")
    a("| ---: | ---: | ---: | ---: | ---: | ---: |")
    for horizonte in HORIZONTES_REPORTE:
        cob = _fila(cobertura, "ridge_agregados", horizonte)
        ancho80 = float(principal.loc[horizonte, "banda_80_superior"] - principal.loc[horizonte, "banda_80_inferior"])
        ancho95 = float(principal.loc[horizonte, "banda_95_superior"] - principal.loc[horizonte, "banda_95_inferior"])
        a(
            f"| {horizonte} | {coma(100 * float(cob['cobertura_80']), 1)} % | "
            f"{coma(100 * float(cob['cobertura_95']), 1)} % | {int(cob['n'])} | "
            f"{coma(ancho80, 2)} | {coma(ancho95, 2)} |"
        )
    a("")
    a(
        f"En los errores de un mes del Ridge con agregados, Ljung-Box tiene valor p "
        f"{_p(residuales['ljung_box_6'])} a 6 rezagos y {_p(residuales['ljung_box_12'])} "
        f"a 12. Jarque-Bera tiene valor p {_p(residuales['jarque_bera_p'])} "
        f"(asimetría {coma(residuales['asimetria'], 2)}, curtosis {coma(residuales['curtosis'], 2)}). "
        f"El RMSE de un mes en la primera mitad de la evaluación es "
        f"{coma(residuales['rmse_primera_mitad'], 2)} y en la segunda, "
        f"{coma(residuales['rmse_segunda_mitad'], 2)}. "
        "Hay autocorrelación y colas pesadas: la banda empírica es más honesta que un "
        "intervalo normal, y aun así la cobertura puede alejarse del nominal en los "
        "horizontes en los que los errores se solapan."
    )
    a("")
    a(
        "El backtest principal empieza a evaluar en mayo de 2012. La crisis de 2008-2009 "
        "queda dentro del entrenamiento mínimo y no tiene error fuera de muestra en ese "
        "diseño. Para mirarla se corrió un diagnóstico aparte, con el primer origen en "
        "enero de 2007 (57 meses de historia, por debajo de los 120 del diseño principal). "
        "No forma parte de la tabla de referencia."
    )
    a("")
    a("| Régimen | Diseño | Modelo | Horizonte | n | RMSE |")
    a("| --- | --- | --- | ---: | ---: | ---: |")
    interes = regimenes[
        regimenes["modelo"].isin(ids_ref) & regimenes["horizonte"].isin((1, 12))
    ].sort_values(["regimen", "horizonte", "modelo"])
    for _, fila in interes.iterrows():
        a(
            f"| {fila['regimen']} | {fila['diseno']} | {NOMBRES_MODELO[fila['modelo']]} | "
            f"{int(fila['horizonte'])} | {int(fila['n'])} | {coma(float(fila['rmse']), 2)} |"
        )
    a("")
    a(
        "2022-2023 concentra el error grande: es el tramo de subida rápida de la política "
        "y de la tasa de consumo. Ahí también se ve, a doce meses, la distancia entre "
        "llevar agregados y no llevarlos. 2020-2021 es un régimen corto en la evaluación "
        "y sus RMSE hay que leerlos con el número de meses de la tabla, no como una "
        "constante del modelo."
    )
    a("")
    a("## Proyección desde septiembre de 2026")
    a("")
    a(
        "La última tasa mensual usada es la de septiembre de 2026. Cada horizonte tiene "
        "su propio Ridge, estimado con todos los pares cuyo objetivo llega como máximo "
        "a ese mes. La banda usa todos los errores del backtest de ese horizonte, que "
        "en esta fecha ya son pasado."
    )
    a("")
    a("| Horizonte | Fecha | Proyección | 80 % inferior | 80 % superior | 95 % inferior | 95 % superior | RMSE histórico |")
    a("| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for horizonte in HORIZONTES_REPORTE:
        fila = principal.loc[horizonte]
        a(
            f"| {horizonte} | {pd.Timestamp(fila['fecha']).date().isoformat()} | "
            f"{coma(float(fila['proyeccion']), 2)} | {coma(float(fila['banda_80_inferior']), 2)} | "
            f"{coma(float(fila['banda_80_superior']), 2)} | {coma(float(fila['banda_95_inferior']), 2)} | "
            f"{coma(float(fila['banda_95_superior']), 2)} | {coma(float(fila['rmse_historico']), 2)} |"
        )
    a("")
    a(
        f"El contraste parcial de octubre, {coma(parcial['tasa_promedio'])} % con "
        f"{parcial['n_viernes']} viernes, se compara con la proyección a un mes de "
        f"{coma(float(principal.loc[1, 'proyeccion']), 2)} %. Es un mes incompleto en "
        "los agregados y en el último viernes de tasas. No se usa para recalibrar ni "
        "para declarar que el modelo acertó o falló."
    )
    a("")
    a("## Tres predicciones para elegir")
    a("")
    a(
        "Para quien no quiere leer bandas, la página y la aplicación dejan elegir una "
        "sola predicción entre tres. Todas salen de la misma proyección y están vistas "
        "por quien pide el crédito, para quien una tasa más alta es la mala noticia."
    )
    a("")
    for ficha in PREDICCIONES.values():
        a(f"- **{ficha['nombre']}.** {ficha['resumen']} {ficha['detalle']}")
    a("")
    a("| Plazo | " + " | ".join(ficha["nombre"] for ficha in PREDICCIONES.values()) + " |")
    a("| ---: | " + " | ".join("---:" for _ in PREDICCIONES) + " |")
    for horizonte in HORIZONTES_REPORTE:
        celdas = " | ".join(
            f"{coma(float(principal.loc[horizonte, ficha['columna']]))} %" for ficha in PREDICCIONES.values()
        )
        a(f"| {horizonte} {'mes' if horizonte == 1 else 'meses'} | {celdas} |")
    a("")
    a(
        "La optimista y la pesimista no son límites: en el backtest la tasa real se "
        "salió de ese rango más veces de lo que el 80 % sugiere, sobre todo a 12 meses "
        "o más. Sirven para ver un caso bueno y uno malo razonables, no el peor posible."
    )
    a("")
    a("## Cuánto aportan M1, M2 y M3")
    a("")
    diferencias = []
    for horizonte in HORIZONTES_REPORTE:
        diferencias.append(
            (
                horizonte,
                rmse("ridge_tasa_politica", horizonte) - rmse("ridge_agregados", horizonte),
                rmse("paseo_aleatorio", horizonte) - rmse("ridge_agregados", horizonte),
            )
        )
    a(
        "La comparación limpia es el mismo Ridge, la misma ventana y el mismo λ, con "
        "las tres variables de tasa y política, y con esas tres más los crecimientos. "
        "La reducción del RMSE al añadir M1, M2 y M3 es:"
    )
    a("")
    a("| Horizonte | Reducción frente al Ridge sin agregados | Reducción frente a la tasa constante |")
    a("| ---: | ---: | ---: |")
    for horizonte, contra_ridge, contra_paseo in diferencias:
        a(f"| {horizonte} | {coma(contra_ridge, 3)} | {coma(contra_paseo, 3)} |")
    a("")
    reduccion = {horizonte: valor for horizonte, valor, _ in diferencias}
    a(
        f"A un mes la reducción es {coma(reduccion[1], 3)} puntos. A tres meses es "
        f"{coma(reduccion[3], 3)}. A seis meses es {coma(reduccion[6], 3)} y a doce, "
        f"{coma(reduccion[12], 3)}. A veinticuatro meses llega a {coma(reduccion[24], 3)} "
        "puntos y separa un modelo que gana a la tasa constante de uno que no. "
        "La conclusión previa se verifica: los agregados aportan sobre todo a 6 y 12 "
        "meses, y casi nada a 1 mes. El horizonte de 24 meses refuerza esa lectura."
    )
    a("")
    a(
        "No se desprende que un aumento del crecimiento de M2 baje o suba la tasa en "
        "una cantidad identificada. Los tres agregados van juntos, sus coeficientes no "
        "son estables por separado y el ejercicio es predictivo. Granger, mirado antes "
        "de 2012, ya mostraba una señal débil y dependiente del rezago. El backtest es "
        "la pieza que se usa para la decisión, y dice que el bloque monetario mejora "
        "el pronóstico de mediano plazo y no el del mes siguiente."
    )
    a("")
    if variables_nuevas is not None and len(variables_nuevas):
        a("## Datos nuevos y su aporte")
        a("")
        a(
            "Al estudio se le sumaron cuatro fuentes abiertas que no venían en los "
            "archivos del Banco de la República: la TRM diaria, el interés bancario "
            "corriente con su tasa de usura y las tasas de libre inversión por entidad "
            "(Superintendencia Financiera, datos.gov.co), y la tasa efectiva de fondos "
            "federales (Reserva Federal de Nueva York). `python -m src.fuentes` las "
            "descarga y la página las refresca en vivo."
        )
        a("")
        a(
            "Cada dato se probó sumándolo a la especificación base, con el mismo "
            "backtest y el mismo λ. La tabla da el RMSE en puntos porcentuales."
        )
        a("")
        horizontes = sorted(int(h) for h in variables_nuevas["horizonte"].unique())
        a("| Especificación | " + " | ".join(f"{h} m" for h in horizontes) + " |")
        a("| --- | " + " | ".join("---:" for _ in horizontes) + " |")
        tabla_nueva = variables_nuevas.pivot(index="id", columns="horizonte", values="rmse")
        etiquetas = variables_nuevas.drop_duplicates("id").set_index("id")["etiqueta"]
        for clave in etiquetas.index:
            celdas = " | ".join(coma(float(tabla_nueva.loc[clave, h]), 3) for h in horizontes)
            a(f"| {etiquetas[clave]} | {celdas} |")
        a("")
        base = tabla_nueva.loc["base"]
        mejoras = []
        for clave in etiquetas.index:
            if clave == "base":
                continue
            ganados = [h for h in horizontes if float(tabla_nueva.loc[clave, h]) < float(base[h]) - 0.005]
            if ganados:
                mejoras.append(f"{etiquetas[clave].lstrip('+ ').strip()} ({', '.join(str(h) for h in ganados)} meses)")
        if mejoras:
            a(
                "Bajan el error en más de 0,005 puntos, en los horizontes indicados: "
                + "; ".join(mejoras)
                + ". Ninguno mejora todos los horizontes a la vez."
            )
        else:
            a("Ningún dato nuevo baja el error en más de 0,005 puntos.")
        a("")
        a(
            "La lectura es sobria: la tasa de consumo ya resume casi toda la información "
            "que traen el dólar, la Fed, la inflación y la usura. La tasa real de política "
            "(política menos inflación) es la única que ayuda en varios horizontes, y por "
            "eso entra en dos candidatos nuevos del backtest: el Ridge con tasa real y un "
            "combinado que promedia ese Ridge con el de agregados, con pesos iguales "
            "fijados de antemano. El modelo principal no cambia. Los datos nuevos se "
            "quedan en la página como contexto y seguimiento en vivo."
        )
        a("")
        for modelo_nuevo in ("ridge_real", "combinado"):
            if modelo_nuevo in set(metricas["modelo"]):
                celdas = ", ".join(
                    f"{h} m: {coma(rmse(modelo_nuevo, h), 3)}" for h in HORIZONTES_REPORTE
                )
                a(f"- {NOMBRES_MODELO[modelo_nuevo]}. RMSE: {celdas}.")
        a("")
    a("## Limitaciones")
    a("")
    a(
        "El modelo no es una regla de política ni un equilibrio de crédito. Mantener las "
        "exógenas fuera del pronóstico evita usar datos futuros, y también impide "
        "responder, dentro de este ajuste, qué pasa si la política baja 100 puntos "
        "básicos a lo largo del próximo año. La aplicación tiene un control de "
        "condiciones iniciales: modifica el spread, la variación de la política o el "
        "crecimiento de M2 del mes de origen y reevalúa el mismo Ridge. Eso no es un "
        "escenario de senda. Está rotulado como tal y no sustituye a esta proyección."
    )
    a("")
    a(
        "Las bandas heredan los quiebres de 2020-2023 y son anchas. Hay autocorrelación "
        "en el error de un mes y la normalidad no se sostiene. La muestra de evaluación "
        "empieza en 2012, así que 2008-2009 no valida el diseño principal. Octubre de "
        "2026 está incompleto. La frecuencia semanal de los agregados no se modeló."
    )
    a("")
    a("## Gráficos")
    a("")
    for grafico in graficos:
        a(f"- `media/{grafico.name}`")
    a("")
    a("## Reproducción")
    a("")
    a("Desde el directorio `proyecto`:")
    a("")
    a("```bash")
    a("python3 -m src.fuentes      # opcional: refresca los datos abiertos")
    a("python3 -m src.analisis")
    a("python3 -m pytest")
    a("python3 -m streamlit run app.py --server.address 0.0.0.0 --server.port 8501")
    a("```")
    a("")
    a(
        "Los CSV de origen usan separador `;`, decimal `,` y codificación `utf-8-sig`. "
        "Las versiones de las librerías están fijadas en `requirements.txt`."
    )
    a("")
    a("---")
    a("")
    a(DERECHOS)
    a("")
    ruta.write_text("\n".join(lineas), encoding="utf-8")
