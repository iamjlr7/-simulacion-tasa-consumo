"""Descarga de datos abiertos que complementan los CSV del Banco de la República.

Todas las fuentes son públicas, no piden clave y permiten consultas desde el
navegador (CORS), así que la página puede refrescarlas en vivo:

- TRM diaria. Superintendencia Financiera, datos.gov.co, conjunto ``mcec-87by``.
- Interés bancario corriente y usura. Superintendencia Financiera, ``pare-7x5i``.
- Tasas activas por entidad y producto. Superintendencia Financiera,
  ``qzsc-9esp`` (últimos dos meses, corte semanal).
- Tasa efectiva de fondos federales (EFFR). Banco de la Reserva Federal de
  Nueva York.

Uso::

    python -m src.fuentes

Escribe los CSV en ``data/raw/externos/`` y un ``fuentes.json`` con la hora de
descarga, la dirección consultada y el rango de fechas de cada archivo.
"""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from src.config import DATOS_EXTERNOS

SOCRATA = "https://www.datos.gov.co/resource"
ID_TRM = "mcec-87by"
ID_IBC = "pare-7x5i"
ID_TASAS_ACTIVAS = "qzsc-9esp"
URL_EFFR = "https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json"
AGENTE = "Mozilla/5.0 (estudio academico de tasas de interes)"
TIPO_CREDITO = "Consumo"
PRODUCTO = "Libre inversión"
MODALIDAD_IBC = "CONSUMO Y ORDINARIO"
FACTOR_USURA = 1.5

ARCHIVO_TRM = "trm_diaria.csv"
ARCHIVO_EFFR = "fed_effr_diaria.csv"
ARCHIVO_IBC = "interes_bancario_corriente.csv"
ARCHIVO_BANCOS = "libre_inversion_por_entidad.csv"
ARCHIVO_SEMANAL = "libre_inversion_semanal.csv"
ARCHIVO_META = "fuentes.json"


def _get_json(url: str, parametros: dict[str, Any] | None = None, espera: int = 120, intentos: int = 3) -> Any:
    """GET con reintentos. El portal de datos abiertos a veces responde 503."""
    destino = url
    if parametros:
        destino = f"{url}?{urllib.parse.urlencode(parametros)}"
    ultimo: Exception | None = None
    for intento in range(intentos):
        try:
            pedido = urllib.request.Request(destino, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(pedido, timeout=espera) as respuesta:
                return json.loads(respuesta.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001 - se reintenta cualquier fallo de red
            ultimo = error
            time.sleep(2 + 3 * intento)
    raise ConnectionError(f"No se pudo consultar {destino}: {ultimo}")


def descargar_trm() -> pd.DataFrame:
    """TRM vigente por día desde diciembre de 1991, en pesos por dólar."""
    filas = _get_json(
        f"{SOCRATA}/{ID_TRM}.json",
        {"$select": "vigenciadesde,vigenciahasta,valor", "$order": "vigenciadesde", "$limit": 50000},
    )
    tabla = pd.DataFrame(filas)
    tabla["desde"] = pd.to_datetime(tabla["vigenciadesde"]).dt.normalize()
    tabla["hasta"] = pd.to_datetime(tabla["vigenciahasta"]).dt.normalize()
    tabla["trm"] = tabla["valor"].astype(float)
    # Cada registro rige varios días (fines de semana y festivos). Se expande
    # a calendario diario para que el promedio mensual pese cada día vigente.
    partes = [
        pd.DataFrame({"fecha": pd.date_range(fila.desde, max(fila.desde, fila.hasta), freq="D"), "trm": fila.trm})
        for fila in tabla.itertuples()
    ]
    diaria = pd.concat(partes, ignore_index=True).drop_duplicates("fecha", keep="last")
    return diaria.sort_values("fecha").reset_index(drop=True)


def descargar_effr(inicio: str = "2000-07-03") -> pd.DataFrame:
    """Tasa efectiva de fondos federales, diaria, en porcentaje."""
    datos = _get_json(URL_EFFR, {"startDate": inicio, "endDate": date.today().isoformat(), "type": "rate"})
    tabla = pd.DataFrame(datos["refRates"])
    salida = pd.DataFrame(
        {
            "fecha": pd.to_datetime(tabla["effectiveDate"]),
            "effr": tabla["percentRate"].astype(float),
        }
    )
    return salida.dropna().sort_values("fecha").reset_index(drop=True)


def descargar_ibc() -> pd.DataFrame:
    """Interés bancario corriente de consumo y ordinario, con su tasa de usura.

    La usura es 1,5 veces el interés bancario corriente certificado. Es el
    tope legal que puede cobrar un crédito de consumo.
    """
    filas = _get_json(
        f"{SOCRATA}/{ID_IBC}.json",
        {"$where": f"modalidad='{MODALIDAD_IBC}'", "$order": "vigencia_desde", "$limit": 5000},
    )
    tabla = pd.DataFrame(filas)
    salida = pd.DataFrame(
        {
            "desde": pd.to_datetime(tabla["vigencia_desde"]).dt.normalize(),
            "hasta": pd.to_datetime(tabla["vigencia_hasta"]).dt.normalize(),
            "resolucion": tabla["resolucion"].astype(str),
            "ibc": tabla["interes_bancario_corriente"].str.replace("%", "", regex=False).str.replace(",", ".", regex=False).astype(float),
        }
    )
    salida["usura"] = (salida["ibc"] * FACTOR_USURA).round(2)
    return salida.sort_values("desde").drop_duplicates("desde", keep="last").reset_index(drop=True)


def _filtro_producto(fecha: str) -> str:
    return (
        f"fecha_corte='{fecha}T00:00:00' AND tipo_de_cr_dito='{TIPO_CREDITO}' "
        f"AND producto_de_cr_dito='{PRODUCTO}'"
    )


def fechas_corte() -> list[str]:
    """Cortes semanales disponibles en el conjunto de los últimos dos meses."""
    ultimo = _get_json(f"{SOCRATA}/{ID_TASAS_ACTIVAS}.json", {"$select": "max(fecha_corte) as f"})[0]["f"]
    primero = _get_json(f"{SOCRATA}/{ID_TASAS_ACTIVAS}.json", {"$select": "min(fecha_corte) as f"})[0]["f"]
    viernes = pd.date_range(pd.Timestamp(primero).normalize(), pd.Timestamp(ultimo).normalize(), freq="W-FRI")
    return [dia.date().isoformat() for dia in viernes]


def descargar_por_entidad(fecha: str) -> pd.DataFrame:
    """Tasa promedio ponderada por monto de libre inversión, por entidad, en un corte."""
    filas = _get_json(
        f"{SOCRATA}/{ID_TASAS_ACTIVAS}.json",
        {
            "$select": (
                "nombre_entidad,nombre_tipo_entidad,"
                "sum(tasa_efectiva_promedio*montos_desembolsados) as tasa_por_monto,"
                "sum(montos_desembolsados) as monto,sum(numero_de_creditos) as creditos"
            ),
            "$where": _filtro_producto(fecha),
            "$group": "nombre_entidad,nombre_tipo_entidad",
            "$order": "monto DESC",
            "$limit": 500,
        },
        espera=180,
    )
    if not filas:
        return pd.DataFrame(columns=["fecha", "entidad", "tipo_entidad", "tasa", "monto", "creditos"])
    tabla = pd.DataFrame(filas)
    monto = tabla["monto"].astype(float)
    salida = pd.DataFrame(
        {
            "fecha": fecha,
            "entidad": tabla["nombre_entidad"].str.strip(),
            "tipo_entidad": tabla["nombre_tipo_entidad"].str.strip(),
            "tasa": (tabla["tasa_por_monto"].astype(float) / monto).round(4),
            "monto": monto.round(0),
            "creditos": tabla["creditos"].astype(float).round(0).astype(int),
        }
    )
    return salida.loc[salida["monto"] > 0].reset_index(drop=True)


def resumen_semanal(por_entidad: pd.DataFrame) -> pd.DataFrame:
    """Tasa del sistema por corte: promedio ponderado por monto desembolsado."""
    filas: list[dict[str, Any]] = []
    for fecha, grupo in por_entidad.groupby("fecha"):
        monto = float(grupo["monto"].sum())
        filas.append(
            {
                "fecha": fecha,
                "tasa": round(float((grupo["tasa"] * grupo["monto"]).sum() / monto), 4),
                "monto": monto,
                "creditos": int(grupo["creditos"].sum()),
                "entidades": int(len(grupo)),
            }
        )
    return pd.DataFrame(filas).sort_values("fecha").reset_index(drop=True)


def descargar_todo(directorio: Path | None = None) -> dict[str, Any]:
    """Baja todas las fuentes y deja los CSV con su ficha de procedencia."""
    destino = Path(directorio) if directorio is not None else DATOS_EXTERNOS
    destino.mkdir(parents=True, exist_ok=True)
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    ficha: dict[str, Any] = {"descargado": ahora, "archivos": {}}

    def anotar(nombre: str, tabla: pd.DataFrame, columna: str, fuente: str, direccion: str) -> None:
        tabla.to_csv(destino / nombre, index=False)
        fechas = pd.to_datetime(tabla[columna])
        ficha["archivos"][nombre] = {
            "fuente": fuente,
            "direccion": direccion,
            "filas": int(len(tabla)),
            "inicio": fechas.min().date().isoformat(),
            "fin": fechas.max().date().isoformat(),
        }
        print(f"  {nombre}: {len(tabla)} filas, {fechas.min().date()} a {fechas.max().date()}", flush=True)

    print("TRM…", flush=True)
    anotar(
        ARCHIVO_TRM, descargar_trm(), "fecha",
        "Superintendencia Financiera de Colombia, datos.gov.co",
        f"https://www.datos.gov.co/d/{ID_TRM}",
    )
    print("Fondos federales…", flush=True)
    anotar(
        ARCHIVO_EFFR, descargar_effr(), "fecha",
        "Banco de la Reserva Federal de Nueva York",
        "https://www.newyorkfed.org/markets/reference-rates/effr",
    )
    print("Interés bancario corriente y usura…", flush=True)
    anotar(
        ARCHIVO_IBC, descargar_ibc(), "desde",
        "Superintendencia Financiera de Colombia, datos.gov.co",
        f"https://www.datos.gov.co/d/{ID_IBC}",
    )
    print("Libre inversión por entidad…", flush=True)
    partes: list[pd.DataFrame] = []
    for fecha in fechas_corte():
        try:
            parte = descargar_por_entidad(fecha)
        except ConnectionError as error:
            print(f"  {fecha}: sin respuesta ({error})", flush=True)
            continue
        print(f"  {fecha}: {len(parte)} entidades", flush=True)
        if len(parte):
            partes.append(parte)
    if partes:
        por_entidad = pd.concat(partes, ignore_index=True)
        anotar(
            ARCHIVO_BANCOS, por_entidad, "fecha",
            "Superintendencia Financiera de Colombia, datos.gov.co",
            f"https://www.datos.gov.co/d/{ID_TASAS_ACTIVAS}",
        )
        anotar(
            ARCHIVO_SEMANAL, resumen_semanal(por_entidad), "fecha",
            "Superintendencia Financiera de Colombia, datos.gov.co",
            f"https://www.datos.gov.co/d/{ID_TASAS_ACTIVAS}",
        )
    (destino / ARCHIVO_META).write_text(json.dumps(ficha, ensure_ascii=False, indent=2), encoding="utf-8")
    return ficha


if __name__ == "__main__":
    descargar_todo()
