# TasaViva: proyección de la tasa de crédito de consumo en Colombia

## Lectura para la decisión

La tasa mensual del crédito de consumo, libre inversión, cerró septiembre de 2026 en 21,25 % efectivo anual. El Ridge directo que usa la variación reciente de la tasa, el spread frente a la política, la variación de la política y el crecimiento anual de M1, M2 y M3 la ubica, desde ese cierre, en 21,53 % a un mes, 22,04 % a tres, 22,94 % a seis y 23,84 % a doce.

A un mes, el RMSE del backtest es 0,53 puntos porcentuales con agregados y 0,54 sin ellos. La tasa constante queda en 0,61. A doce meses las cifras son 3,18, 3,76 y 3,92. M1, M2 y M3, tomados en conjunto, casi no mueven el error de corto plazo y sí reducen el error a seis, doce y veinticuatro meses. La inflación, añadida como regresora, no mejora ese error.

Esto es una proyección estadística con bandas anchas. A doce meses la banda del 95 % cubre varios puntos porcentuales. No es una meta del Banco de la República ni asesoría para prestar, invertir o fijar una tasa.

## Qué serie se proyecta

La variable objetivo es la columna «Crédito de consumo, Tasa de interés, semanal» del archivo de tasas de interés. En este estudio esa columna es la tasa de crédito de consumo de libre inversión, en porcentaje efectivo anual. El archivo también trae la colocación del Banco de la República, la colocación total y las tasas comerciales ordinaria, preferencial y de tesorería; no entran al modelo.

La muestra común va de 2002-05-31 a 2026-09-30: 293 cierres mensuales. Octubre y noviembre de 2026 no se usan para entrenar. Octubre aparece solo como contraste parcial.

## Calidad de los datos

El modelo se estima en frecuencia mensual. La tasa de consumo semanal (viernes) y la tasa de política diaria entran como promedio del mes calendario, fechado al cierre. Los agregados monetarios se toman en su cierre de mes. La extensión semanal de los agregados no se usa en el modelo principal.

La tasa semanal tiene 1278 viernes, del 2002-05-03 al 2026-10-23, sin fechas duplicadas y sin huecos distintos de siete días. La política diaria va del 1998-02-13 al 2026-11-09, también sin duplicados. Falta un día de calendario: 2026-10-16. Ese hueco cae en octubre de 2026, fuera de la muestra de estimación. El último valor diario de la política es 12,25 %.

Los agregados mensuales cubren 513 cierres, del 1984-01-31 al 2026-09-30, sin meses faltantes ni nulos. La serie semanal de agregados tiene 2334 observaciones y 14 saltos distintos de siete días; queda como extensión y no entra al modelo. La meta de inflación está vacía en los años anteriores a 1991 (426 meses) y está completa dentro de la muestra de tasas.

En el panel mensual no hay nulos en tasa, política, agregados, inflación, meta ni IPC. El cierre de septiembre de 2026 es 21,25 % para el consumo y 12,00 % para la política. El 12,25 % de política es el nivel vigente desde el 1 de octubre de 2026, no el promedio de septiembre.

Los cambios mensuales de la tasa con puntuación robusta superior a 3,5, en valor absoluto, son: 2007-05-31 (1,58 puntos); 2007-07-31 (1,62 puntos); 2012-01-31 (1,55 puntos); 2017-01-31 (1,57 puntos); 2019-01-31 (1,60 puntos); 2020-05-31 (-1,47 puntos); 2022-01-31 (1,61 puntos); 2022-07-31 (1,70 puntos). Hay 4 casos más en el archivo de calidad. Se conservan. Corresponden a saltos del ciclo de tasas, no a errores de captura evidentes, y excluirlos borraría precisamente los episodios que el error de pronóstico tiene que enfrentar.

Octubre de 2026, con 4 viernes entre 2026-10-02 y 2026-10-23, promedia 21,36 % en consumo y 12,25 % en política. Los agregados mensuales no tienen cierre de octubre. Esa observación no entra al ajuste.

Como control de coherencia, la inflación anual calculada con el IPC, 100 × (IPCₜ / IPCₜ₋₁₂ − 1), correlaciona 1,000 con la serie oficial de inflación total anual. La diferencia absoluta máxima es 0,02 puntos y la mediana es 0,00. La serie oficial es la que se usa cuando la inflación entra como regresor de contraste.

## Preparación

La frecuencia de modelado es mensual. Cada mes de la tasa de consumo es el promedio simple de los viernes cuya fecha cae en ese mes, fechado al cierre. Septiembre de 2026 tiene cuatro viernes y ese promedio es exactamente 21,25 %, que es el nivel de partida de la proyección. No se usa el último viernes del mes: el 25 de septiembre la tasa fue 20,96 %. La política mensual es el promedio de los días del mes. M1, M2 y M3 entran en niveles de cierre, en miles de millones de pesos, y el modelo los usa solo en crecimiento anual, 100 × ln(Mₜ / Mₜ₋₁₂).

También se construyen la variación a tres meses de la tasa, la variación a tres meses de la política, el spread (tasa de consumo menos política) y la brecha de inflación (inflación menos meta). La ventana expansiva exige 120 meses antes del primer origen. Ese origen es abril de 2012 y la primera predicción, a un mes, es mayo de 2012. En cada origen solo entran pares cuyo objetivo ya se observó. La media y la desviación del Ridge se calculan con esos pares y no con el vector del propio origen ni con meses posteriores.

## Exploración

En la muestra, la tasa de consumo promedia 20,70 % (desviación 3,99, entre 13,56 y 30,98). La política promedia 6,32 % y el spread 14,38 puntos. El crecimiento anual medio es 10,73 % en M1, 11,53 % en M2 y 11,27 % en M3.

Los crecimientos de M1, M2 y M3 están fuertemente alineados: la correlación M1–M2 es 0,47, la M1–M3 es 0,47 y la M2–M3 es 0,97. Los factores de inflación de la varianza, calculados sobre las seis variables del Ridge en la muestra común, cuantifican esa colinealidad:

| Variable | VIF |
| --- | ---: |
| dy3 | 2,0 |
| spread | 1,2 |
| dpol3 | 2,0 |
| g_m1 | 1,4 |
| g_m2 | 19,5 |
| g_m3 | 20,6 |

Un VIF alto en los crecimientos monetarios impide leer el coeficiente de M1, de M2 o de M3 como el efecto de ese agregado. El aporte que se evalúa más abajo es el de los tres juntos, frente a un modelo que solo tiene la tasa y la política.

La correlación de la tasa con el nivel del agregado no se usa para decidir: M1, M2 y M3 son tendencias integradas y esa correlación no es un resultado de pronóstico. La correlación relevante para el modelo es la de la tasa con el crecimiento rezagado. El rezago, entre 0 y 12 meses, con mayor correlación absoluta es el siguiente.

| Variable rezagada | Rezago de mayor correlación | Correlación |
| --- | ---: | ---: |
| g_m1 | 0 | -0,41 |
| g_m2 | 7 | 0,29 |
| g_m3 | 8 | 0,31 |

## Pruebas de series

ADF usa la constante en tasas, crecimientos y diferencias, y constante más tendencia en los niveles de M1, M2 y M3. KPSS usa la misma especificación. El valor p de KPSS está recortado por statsmodels al rango 0,01–0,10. «Compatible con raíz unitaria» quiere decir que ADF no rechaza la nula al 5 % y KPSS sí rechaza la estacionariedad.

| Serie | ADF, valor p | KPSS, valor p | Lectura |
| --- | ---: | ---: | --- |
| Tasa de consumo | 0,062 | 0,010 | compatible con raíz unitaria |
| Diferencia de la tasa | < 0,001 | 0,100 | compatible con estacionariedad |
| Tasa de política | 0,043 | 0,084 | compatible con estacionariedad |
| Diferencia de la política | < 0,001 | 0,100 | compatible con estacionariedad |
| M1, nivel | 0,568 | 0,010 | compatible con raíz unitaria |
| M2, nivel | 1,000 | 0,010 | compatible con raíz unitaria |
| M3, nivel | 1,000 | 0,010 | compatible con raíz unitaria |
| Diferencia de M1 | 0,047 | 0,066 | compatible con estacionariedad |
| Diferencia de M2 | 0,489 | 0,010 | compatible con raíz unitaria |
| Diferencia de M3 | 0,681 | 0,010 | compatible con raíz unitaria |
| Crecimiento de M1 | 0,017 | 0,098 | compatible con estacionariedad |
| Crecimiento de M2 | 0,184 | 0,010 | compatible con raíz unitaria |
| Crecimiento de M3 | 0,241 | 0,010 | compatible con raíz unitaria |
| Spread | 0,313 | 0,010 | compatible con raíz unitaria |
| Inflación | 0,043 | 0,100 | compatible con estacionariedad |
| Brecha de inflación | 0,095 | 0,013 | compatible con raíz unitaria |

La tasa de consumo se comporta como una serie integrada en el margen, y su primera diferencia queda estacionaria. Los niveles de M1, M2 y M3 también. Por eso el modelo predictivo usa el crecimiento anual y no el saldo. Los crecimientos siguen siendo persistentes: KPSS rechaza estacionariedad en M2 y M3, así que no conviene tratarlos como ruido transitorio.

Granger se estima sobre la diferencia de la tasa, que es la transformación estacionaria, y no sobre el nivel. La tabla trae el valor p de la prueba F con 3, 6 y 12 rezagos. La columna de abril de 2012 usa solo la información anterior a la evaluación; la otra usa la muestra completa y es descriptiva.

| Causa de la diferencia de la tasa | Rezago | p hasta abril de 2012 | p en toda la muestra |
| --- | ---: | ---: | ---: |
| Crecimiento de M1 | 3 | 0,442 | 0,016 |
| Crecimiento de M1 | 6 | 0,789 | 0,058 |
| Crecimiento de M1 | 12 | 0,661 | 0,004 |
| Crecimiento de M2 | 3 | 0,370 | 0,757 |
| Crecimiento de M2 | 6 | 0,157 | 0,168 |
| Crecimiento de M2 | 12 | 0,442 | 0,048 |
| Crecimiento de M3 | 3 | 0,086 | 0,381 |
| Crecimiento de M3 | 6 | 0,056 | 0,140 |
| Crecimiento de M3 | 12 | 0,286 | 0,139 |
| Diferencia de la política | 3 | 0,032 | < 0,001 |
| Diferencia de la política | 6 | 0,122 | < 0,001 |
| Diferencia de la política | 12 | 0,610 | < 0,001 |

La variación de la política anticipa la variación de la tasa de consumo en las dos ventanas. El contenido de los agregados es más frágil y depende del rezago. Esa fragilidad encaja con el backtest: el dinero aporta poco a un mes y algo más cuando el horizonte deja correr el ciclo.

Engle-Granger entre la tasa de consumo y la política tiene valor p 0,525. Entre la tasa y el logaritmo de M2, 0,151. Johansen sobre tasa y política da una traza de 10,69 frente a un crítico del 5 % de 15,49. Con tasa, política y logaritmo de M2 la traza es 28,56 y el crítico es 29,80. Al 5 % no se sostiene una relación de cointegración. El VECM de rango 1 se corre igual, como contraste, y no es el modelo que se mantiene.

Una regresión del cambio mensual de la tasa sobre dummies de calendario, estimada solo hasta abril de 2012, tiene valor p conjunto 0,626. El SARIMAX no lleva término estacional.

## Modelo principal

Para cada horizonte h de 1 a 24 hay un Ridge distinto. Predice el cambio yₜ₊ₕ − yₜ con seis variables medidas en t: la variación a tres meses de la tasa, el spread, la variación a tres meses de la política y los crecimientos anuales de M1, M2 y M3. Esas variables se estandarizan con la media y la desviación poblacional de los pares de entrenamiento. λ es 5 y penaliza solo los coeficientes, no el intercepto. La proyección es la tasa del origen más el cambio predicho. No se construye una senda futura de la política ni del dinero.

El modelo sin agregados usa las tres primeras variables y el mismo λ. La tasa constante repite el último valor. Esas tres especificaciones son las que se comparan con la referencia.

Coeficientes del ajuste final, septiembre de 2026, sobre variables estandarizadas:

| Horizonte | Intercepto | dy3 | Spread | dpol3 | g(M1) | g(M2) | g(M3) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | -0,021 | 0,115 | -0,103 | 0,178 | 0,016 | -0,197 | 0,255 |
| 3 | -0,056 | 0,320 | -0,310 | 0,515 | 0,154 | -0,531 | 0,630 |
| 6 | -0,118 | 0,516 | -0,718 | 0,969 | 0,564 | -1,168 | 1,189 |
| 12 | -0,283 | 0,751 | -1,451 | 1,267 | 1,855 | -2,131 | 1,601 |
| 24 | -0,575 | 0,179 | -2,529 | 0,385 | 3,901 | -0,657 | -0,418 |

Los signos de g(M1), g(M2) y g(M3) cambian de magnitud y, entre ellos, de dirección. Con las correlaciones y los VIF de arriba, esa inestabilidad es la esperada. No se traduce a una elasticidad de la tasa respecto de un agregado.

## Backtest

La ventana es expansiva, el reajuste es mensual y el mínimo de historia es 120 meses. Los horizontes de la referencia son 1, 3, 6 y 12 meses; también se reportan 24. El RMSE es la raíz del promedio de los errores al cuadrado, en puntos porcentuales, sobre los meses objetivo ya realizados hasta septiembre de 2026. El MASE divide el MAE por el cambio absoluto medio de un mes entre mayo de 2002 y abril de 2012 (0,337 puntos). Diebold-Mariano usa pérdida cuadrática, varianza Newey-West con h−1 rezagos y el ajuste de Harvey, Leybourne y Newbold, siempre contra la tasa constante. Un estadístico negativo favorece al modelo.

### Comparación con la referencia

La referencia está publicada a dos decimales. La tolerancia acordada para dar por reproducido el RMSE es 0,05 puntos. La tabla muestra primero el valor de esta ejecución y, entre paréntesis, el publicado.

| Horizonte | Ridge con M1, M2 y M3 | Ridge solo tasa y política | Tasa constante |
| ---: | ---: | ---: | ---: |
| 1 | 0,533 (0,53) | 0,537 (0,54) | 0,609 (0,61) |
| 3 | 0,961 (0,96) | 0,996 (1,00) | 1,269 (1,27) |
| 6 | 1,756 (1,76) | 1,927 (1,94) | 2,273 (2,28) |
| 12 | 3,178 (3,19) | 3,764 (3,79) | 3,917 (3,93) |

La mayor distancia absoluta frente a la referencia, en esos doce números, es 0,026 puntos. Queda dentro de la tolerancia de 0,05. A doce meses el Ridge con agregados da 3,178 y la referencia dice 3,19; el Ridge sin agregados da 3,764 frente a 3,79. La proyección puntual, en cambio, coincide con la referencia al centésimo:

| Horizonte | Esta ejecución | Referencia | Diferencia |
| ---: | ---: | ---: | ---: |
| 1 | 21,53 | 21,53 | 0,003 |
| 3 | 22,04 | 22,04 | 0,002 |
| 6 | 22,94 | 22,94 | 0,003 |
| 12 | 23,84 | 23,84 | 0,004 |

El punto de partida publicado es 21,25 %, el mismo promedio de septiembre de 2026. La coincidencia del pronóstico identifica la especificación: λ = 5, estandarización con desviación poblacional, pares con objetivo ya observado y promedio mensual de los viernes. La diferencia de una o dos centésimas en el RMSE de los horizontes largos puede venir del redondeo a dos decimales de la tabla publicada y de algún detalle menor de la ventana. No se aflojó la prueba para absorberla: la tolerancia sigue en 0,05 puntos y el resultado queda por dentro.

RMSE a 24 meses, que la referencia no publica:

| Modelo | RMSE | MAE | Razón frente a la tasa constante |
| --- | ---: | ---: | ---: |
| Ridge con agregados | 3,773 | 2,607 | 0,655 |
| Ridge solo tasa y política | 5,918 | 4,278 | 1,027 |
| Tasa constante | 5,762 | 4,090 | 1,000 |

A 24 meses la tasa y la política, sin agregados, no mejoran a la tasa constante. Los agregados sí bajan el RMSE. El resultado alarga lo que ya se ve a 12 meses y no lo contradice.

### Resto de modelos, mismo backtest

El orden del autorregresivo se elige por AIC en cada origen, con máximo de 12. El VAR elige el orden por AIC con máximo de 4 y se estima sobre la variación de la tasa, la variación de la política y el crecimiento de M2; el nivel se recupera sumando esas variaciones. El SARIMAX es (1, 1, 0) con la política y el crecimiento de M2 rezagados un mes; de ahí en adelante esas exógenas se dejan en el último valor conocido. Lasso y Elastic Net eligen λ con el bloque reciente del entrenamiento, nunca con validación cruzada aleatoria, y luego se reestiman con todos los pares disponibles en el origen. El componente principal de M1, M2 y M3 se calcula solo con esas filas y entra a un Ridge con el mismo λ = 5. La potenciación de gradiente usa 80 árboles, profundidad 2 y tasa de aprendizaje 0,05, fijos de antemano. Cuando un modelo iterativo no converge, ese origen se sustituye por la tasa vigente y se cuenta abajo.

Ningún origen de los modelos iterativos tuvo que sustituirse por la tasa vigente.

| Modelo | 1 | 3 | 6 | 12 | 24 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ridge con agregados | 0,53 | 0,96 | 1,76 | 3,18 | 3,77 |
| Ridge solo tasa y política | 0,54 | 1,00 | 1,93 | 3,76 | 5,92 |
| Tasa constante | 0,61 | 1,27 | 2,27 | 3,92 | 5,76 |
| Autorregresivo | 0,55 | 1,09 | 2,00 | 3,59 | 5,12 |
| SARIMAX con exógenas rezagadas | 0,62 | 1,29 | 2,31 | 4,00 | 6,02 |
| VAR en diferencias | 0,55 | 1,00 | 1,96 | 4,11 | 7,32 |
| VECM tasa y política | 0,58 | 1,13 | 2,16 | 4,15 | 6,79 |
| Elastic Net | 0,53 | 0,96 | 1,80 | 3,67 | 4,95 |
| Lasso | 0,53 | 0,96 | 1,81 | 3,75 | 4,96 |
| Componentes principales | 0,53 | 0,98 | 1,88 | 3,67 | 5,34 |
| Potenciación de gradiente | 0,55 | 1,14 | 2,38 | 3,72 | 4,80 |
| Ridge con inflación | 0,54 | 1,00 | 1,86 | 3,33 | 4,00 |
| Ridge con brecha de inflación | 0,54 | 1,01 | 1,90 | 3,35 | 4,28 |
| Ridge con tasa real de política | 0,52 | 0,93 | 1,75 | 3,36 | 3,67 |
| Combinado (agregados + tasa real) | 0,53 | 0,93 | 1,73 | 3,24 | 3,71 |

Razón del RMSE frente a la tasa constante. Por debajo de 1 el modelo gana.

| Modelo | 1 | 3 | 6 | 12 | 24 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ridge con agregados | 0,87 | 0,76 | 0,77 | 0,81 | 0,65 |
| Ridge solo tasa y política | 0,88 | 0,79 | 0,85 | 0,96 | 1,03 |
| Tasa constante | 1,00 | 1,00 | 1,00 | 1,00 | 1,00 |
| Autorregresivo | 0,90 | 0,86 | 0,88 | 0,92 | 0,89 |
| SARIMAX con exógenas rezagadas | 1,02 | 1,02 | 1,01 | 1,02 | 1,05 |
| VAR en diferencias | 0,89 | 0,78 | 0,86 | 1,05 | 1,27 |
| VECM tasa y política | 0,96 | 0,89 | 0,95 | 1,06 | 1,18 |
| Elastic Net | 0,87 | 0,76 | 0,79 | 0,94 | 0,86 |
| Lasso | 0,88 | 0,75 | 0,80 | 0,96 | 0,86 |
| Componentes principales | 0,88 | 0,77 | 0,83 | 0,94 | 0,93 |
| Potenciación de gradiente | 0,90 | 0,90 | 1,05 | 0,95 | 0,83 |
| Ridge con inflación | 0,88 | 0,79 | 0,82 | 0,85 | 0,69 |
| Ridge con brecha de inflación | 0,88 | 0,80 | 0,84 | 0,85 | 0,74 |
| Ridge con tasa real de política | 0,86 | 0,73 | 0,77 | 0,86 | 0,64 |
| Combinado (agregados + tasa real) | 0,86 | 0,73 | 0,76 | 0,83 | 0,64 |

Diebold-Mariano del Ridge con agregados contra la tasa constante (estadístico HLN y valor p bilateral):

| Horizonte | Estadístico | Valor p | MAE | MASE | Sesgo |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | -2,23 | 0,026 | 0,38 | 1,12 | -0,01 |
| 3 | -1,71 | 0,087 | 0,69 | 2,04 | -0,03 |
| 6 | -1,37 | 0,169 | 1,15 | 3,42 | -0,14 |
| 12 | -1,33 | 0,185 | 2,18 | 6,46 | -0,34 |
| 24 | -1,51 | 0,132 | 2,61 | 7,73 | 0,40 |

Añadir la inflación al Ridge con agregados deja el RMSE de doce meses en 3,33. Añadir la brecha de inflación lo deja en 3,35. El modelo sin esas variables está en 3,18. Ninguna de las dos reduce el error de la referencia de horizontes 1, 3, 6 y 12. La conclusión previa se sostiene.

A doce meses, resumir M1, M2 y M3 en un componente principal da un RMSE de 3,67, frente a 3,18 del Ridge con las tres series. La ganancia monetaria es, en lo fundamental, la de un factor común, no la de tres señales independientes.

## Intervalos, residuos y regímenes

La banda de cada horizonte es el pronóstico más los cuantiles empíricos del error histórico de ese mismo horizonte. El error es tasa realizada menos pronóstico. La banda del 80 % usa los cuantiles 10 y 90; la del 95 %, los cuantiles 2,5 y 97,5. Para medir la cobertura, la banda de un origen se arma solo con errores cuyo mes objetivo ya había ocurrido, y se exigen al menos 36 de esos errores. No es una garantía conformal: los errores se solapan en los horizontes largos y la varianza no es constante. Las bandas se ensanchan con el horizonte porque el error histórico lo hace.

| Horizonte | Cobertura 80 % | Cobertura 95 % | Evaluaciones | Ancho 80 % en sep. 2026 | Ancho 95 % |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 71,5 % | 89,8 % | 137 | 1,13 | 2,25 |
| 3 | 62,4 % | 80,5 % | 133 | 1,99 | 4,38 |
| 6 | 61,4 % | 77,2 % | 127 | 3,24 | 8,42 |
| 12 | 58,3 % | 64,3 % | 115 | 4,81 | 14,93 |
| 24 | 39,6 % | 45,1 % | 91 | 9,43 | 16,12 |

En los errores de un mes del Ridge con agregados, Ljung-Box tiene valor p 0,002 a 6 rezagos y < 0,001 a 12. Jarque-Bera tiene valor p < 0,001 (asimetría 0,28, curtosis 5,27). El RMSE de un mes en la primera mitad de la evaluación es 0,46 y en la segunda, 0,60. Hay autocorrelación y colas pesadas: la banda empírica es más honesta que un intervalo normal, y aun así la cobertura puede alejarse del nominal en los horizontes en los que los errores se solapan.

El backtest principal empieza a evaluar en mayo de 2012. La crisis de 2008-2009 queda dentro del entrenamiento mínimo y no tiene error fuera de muestra en ese diseño. Para mirarla se corrió un diagnóstico aparte, con el primer origen en enero de 2007 (57 meses de historia, por debajo de los 120 del diseño principal). No forma parte de la tabla de referencia.

| Régimen | Diseño | Modelo | Horizonte | n | RMSE |
| --- | --- | --- | ---: | ---: | ---: |
| 2008-2009 | diagnóstico, primer origen en enero de 2007 | Tasa constante | 1 | 24 | 0,43 |
| 2008-2009 | diagnóstico, primer origen en enero de 2007 | Ridge con agregados | 1 | 24 | 0,31 |
| 2008-2009 | diagnóstico, primer origen en enero de 2007 | Ridge solo tasa y política | 1 | 24 | 0,29 |
| 2008-2009 | diagnóstico, primer origen en enero de 2007 | Tasa constante | 12 | 24 | 3,80 |
| 2008-2009 | diagnóstico, primer origen en enero de 2007 | Ridge con agregados | 12 | 24 | 6,38 |
| 2008-2009 | diagnóstico, primer origen en enero de 2007 | Ridge solo tasa y política | 12 | 24 | 7,48 |
| 2015-2016 | backtest principal, 120 meses | Tasa constante | 1 | 24 | 0,32 |
| 2015-2016 | backtest principal, 120 meses | Ridge con agregados | 1 | 24 | 0,30 |
| 2015-2016 | backtest principal, 120 meses | Ridge solo tasa y política | 1 | 24 | 0,30 |
| 2015-2016 | backtest principal, 120 meses | Tasa constante | 12 | 24 | 1,44 |
| 2015-2016 | backtest principal, 120 meses | Ridge con agregados | 12 | 24 | 1,47 |
| 2015-2016 | backtest principal, 120 meses | Ridge solo tasa y política | 12 | 24 | 1,34 |
| 2020-2021 | backtest principal, 120 meses | Tasa constante | 1 | 24 | 0,49 |
| 2020-2021 | backtest principal, 120 meses | Ridge con agregados | 1 | 24 | 0,49 |
| 2020-2021 | backtest principal, 120 meses | Ridge solo tasa y política | 1 | 24 | 0,48 |
| 2020-2021 | backtest principal, 120 meses | Tasa constante | 12 | 24 | 1,59 |
| 2020-2021 | backtest principal, 120 meses | Ridge con agregados | 12 | 24 | 3,43 |
| 2020-2021 | backtest principal, 120 meses | Ridge solo tasa y política | 12 | 24 | 1,91 |
| 2022-2023 | backtest principal, 120 meses | Tasa constante | 1 | 24 | 1,13 |
| 2022-2023 | backtest principal, 120 meses | Ridge con agregados | 1 | 24 | 0,86 |
| 2022-2023 | backtest principal, 120 meses | Ridge solo tasa y política | 1 | 24 | 0,86 |
| 2022-2023 | backtest principal, 120 meses | Tasa constante | 12 | 24 | 8,39 |
| 2022-2023 | backtest principal, 120 meses | Ridge con agregados | 12 | 24 | 6,58 |
| 2022-2023 | backtest principal, 120 meses | Ridge solo tasa y política | 12 | 24 | 7,23 |

2022-2023 concentra el error grande: es el tramo de subida rápida de la política y de la tasa de consumo. Ahí también se ve, a doce meses, la distancia entre llevar agregados y no llevarlos. 2020-2021 es un régimen corto en la evaluación y sus RMSE hay que leerlos con el número de meses de la tabla, no como una constante del modelo.

## Proyección desde septiembre de 2026

La última tasa mensual usada es la de septiembre de 2026. Cada horizonte tiene su propio Ridge, estimado con todos los pares cuyo objetivo llega como máximo a ese mes. La banda usa todos los errores del backtest de ese horizonte, que en esta fecha ya son pasado.

| Horizonte | Fecha | Proyección | 80 % inferior | 80 % superior | 95 % inferior | 95 % superior | RMSE histórico |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2026-10-31 | 21,53 | 20,98 | 22,11 | 20,59 | 22,84 | 0,53 |
| 3 | 2026-12-31 | 22,04 | 21,01 | 23,01 | 19,80 | 24,18 | 0,96 |
| 6 | 2027-03-31 | 22,94 | 21,19 | 24,43 | 19,61 | 28,03 | 1,76 |
| 12 | 2027-09-30 | 23,84 | 20,91 | 25,72 | 18,74 | 33,67 | 3,18 |
| 24 | 2028-09-30 | 24,30 | 20,58 | 30,01 | 18,48 | 34,60 | 3,77 |

El contraste parcial de octubre, 21,36 % con 4 viernes, se compara con la proyección a un mes de 21,53 %. Es un mes incompleto en los agregados y en el último viernes de tasas. No se usa para recalibrar ni para declarar que el modelo acertó o falló.

## Tres predicciones para elegir

Para quien no quiere leer bandas, la página y la aplicación dejan elegir una sola predicción entre tres. Todas salen de la misma proyección y están vistas por quien pide el crédito, para quien una tasa más alta es la mala noticia.

- **Optimista.** La tasa termina en la parte baja de lo probable. Borde inferior del rango del 80 %. En las pruebas con datos del pasado, solo 1 de cada 10 veces la tasa terminó más abajo.
- **Conservadora.** Lo más probable según los datos de hoy. Proyección central del modelo, sin sumarle ni restarle margen de error.
- **Pesimista.** La tasa termina en la parte alta de lo probable. Borde superior del rango del 80 %. En las pruebas con datos del pasado, solo 1 de cada 10 veces la tasa terminó más arriba.

| Plazo | Optimista | Conservadora | Pesimista |
| ---: | ---: | ---: | ---: |
| 1 mes | 20,98 % | 21,53 % | 22,11 % |
| 3 meses | 21,01 % | 22,04 % | 23,01 % |
| 6 meses | 21,19 % | 22,94 % | 24,43 % |
| 12 meses | 20,91 % | 23,84 % | 25,72 % |
| 24 meses | 20,58 % | 24,30 % | 30,01 % |

La optimista y la pesimista no son límites: en el backtest la tasa real se salió de ese rango más veces de lo que el 80 % sugiere, sobre todo a 12 meses o más. Sirven para ver un caso bueno y uno malo razonables, no el peor posible.

## Cuánto aportan M1, M2 y M3

La comparación limpia es el mismo Ridge, la misma ventana y el mismo λ, con las tres variables de tasa y política, y con esas tres más los crecimientos. La reducción del RMSE al añadir M1, M2 y M3 es:

| Horizonte | Reducción frente al Ridge sin agregados | Reducción frente a la tasa constante |
| ---: | ---: | ---: |
| 1 | 0,004 | 0,077 |
| 3 | 0,036 | 0,308 |
| 6 | 0,171 | 0,517 |
| 12 | 0,586 | 0,739 |
| 24 | 2,145 | 1,989 |

A un mes la reducción es 0,004 puntos. A tres meses es 0,036. A seis meses es 0,171 y a doce, 0,586. A veinticuatro meses llega a 2,145 puntos y separa un modelo que gana a la tasa constante de uno que no. La conclusión previa se verifica: los agregados aportan sobre todo a 6 y 12 meses, y casi nada a 1 mes. El horizonte de 24 meses refuerza esa lectura.

No se desprende que un aumento del crecimiento de M2 baje o suba la tasa en una cantidad identificada. Los tres agregados van juntos, sus coeficientes no son estables por separado y el ejercicio es predictivo. Granger, mirado antes de 2012, ya mostraba una señal débil y dependiente del rezago. El backtest es la pieza que se usa para la decisión, y dice que el bloque monetario mejora el pronóstico de mediano plazo y no el del mes siguiente.

## Datos nuevos y su aporte

Al estudio se le sumaron cuatro fuentes abiertas que no venían en los archivos del Banco de la República: la TRM diaria, el interés bancario corriente con su tasa de usura y las tasas de libre inversión por entidad (Superintendencia Financiera, datos.gov.co), y la tasa efectiva de fondos federales (Reserva Federal de Nueva York). `python -m src.fuentes` las descarga y la página las refresca en vivo.

Cada dato se probó sumándolo a la especificación base, con el mismo backtest y el mismo λ. La tabla da el RMSE en puntos porcentuales.

| Especificación | 1 m | 3 m | 6 m | 12 m | 24 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| Especificación base (seis variables) | 0,533 | 0,961 | 1,756 | 3,178 | 3,773 |
| + Tasa real de política | 0,524 | 0,927 | 1,746 | 3,355 | 3,671 |
| + Depreciación anual del peso (TRM) | 0,535 | 0,973 | 1,784 | 3,192 | 3,808 |
| + Depreciación a 3 meses (TRM) | 0,530 | 0,963 | 1,768 | 3,195 | 3,806 |
| + Diferencial frente a la Fed | 0,535 | 0,970 | 1,763 | 3,139 | 4,337 |
| + Diferencial y variación de la Fed | 0,534 | 0,973 | 1,804 | 3,212 | 4,364 |
| + Inflación anual | 0,537 | 1,000 | 1,862 | 3,330 | 3,999 |
| + Holgura frente a la usura | 0,555 | 1,047 | 1,956 | 3,460 | 5,313 |
| + TRM, Fed e inflación a la vez | 0,542 | 1,025 | 1,939 | 3,465 | 4,512 |

Bajan el error en más de 0,005 puntos, en los horizontes indicados: Tasa real de política (1, 3, 6, 24 meses); Diferencial frente a la Fed (12 meses). Ninguno mejora todos los horizontes a la vez.

La lectura es sobria: la tasa de consumo ya resume casi toda la información que traen el dólar, la Fed, la inflación y la usura. La tasa real de política (política menos inflación) es la única que ayuda en varios horizontes, y por eso entra en dos candidatos nuevos del backtest: el Ridge con tasa real y un combinado que promedia ese Ridge con el de agregados, con pesos iguales fijados de antemano. El modelo principal no cambia. Los datos nuevos se quedan en la página como contexto y seguimiento en vivo.

- Ridge con tasa real de política. RMSE: 1 m: 0,524, 3 m: 0,927, 6 m: 1,746, 12 m: 3,355, 24 m: 3,671.
- Combinado (agregados + tasa real). RMSE: 1 m: 0,526, 3 m: 0,932, 6 m: 1,730, 12 m: 3,236, 24 m: 3,707.

## Limitaciones

El modelo no es una regla de política ni un equilibrio de crédito. Mantener las exógenas fuera del pronóstico evita usar datos futuros, y también impide responder, dentro de este ajuste, qué pasa si la política baja 100 puntos básicos a lo largo del próximo año. La aplicación tiene un control de condiciones iniciales: modifica el spread, la variación de la política o el crecimiento de M2 del mes de origen y reevalúa el mismo Ridge. Eso no es un escenario de senda. Está rotulado como tal y no sustituye a esta proyección.

Las bandas heredan los quiebres de 2020-2023 y son anchas. Hay autocorrelación en el error de un mes y la normalidad no se sostiene. La muestra de evaluación empieza en 2012, así que 2008-2009 no valida el diseño principal. Octubre de 2026 está incompleto. La frecuencia semanal de los agregados no se modeló.

## Gráficos

- `media/tasa-consumo-y-politica.png`
- `media/agregados-niveles.png`
- `media/agregados-crecimiento.png`
- `media/matriz-correlacion.png`
- `media/correlacion-cruzada.png`
- `media/rmse-por-horizonte.png`
- `media/proyeccion-septiembre-2026.png`
- `media/residuos-un-paso.png`
- `media/rmse-por-regimen.png`

## Reproducción

Desde el directorio `proyecto`:

```bash
python3 -m src.fuentes      # opcional: refresca los datos abiertos
python3 -m src.analisis
python3 -m pytest
python3 -m streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

Los CSV de origen usan separador `;`, decimal `,` y codificación `utf-8-sig`. Las versiones de las librerías están fijadas en `requirements.txt`.

---

© 2026 Orlando José León Romero, Leyber David Peñaloza y Johan Cruz. Todos los derechos reservados.
