# OPTIMIZACIÓN DEL SISTEMA DE ASIGNACIÓN DE RECURSOS Y TIEMPOS DE ESPERA EN SALAS DE URGENCIAS HOSPITALARIAS MEDIANTE SIMULACIÓN DE EVENTOS DISCRETOS CON COLAS DE PRIORIDAD

**Unidades Tecnológicas de Santander · Facultad de Ciencias Naturales e Ingenierías**
Tecnología en Desarrollo de Software / Ingeniería de Sistemas · Simulación Digital
**Modalidad:** Proyecto de Aula
**Autores:** Rubén Darío Moreno Rivera · Joham Eliasid Osorio Quintero · Yudi Zulay Martínez Suárez
**Director:** Jaidiver Lombo Guzmán
Bucaramanga, Colombia · 2026

> Documento de trabajo. Contiene únicamente los **objetivos específicos** (reformulados con indicador, entregable y evidencia) y el **registro de avance**. Última actualización: 4 de noviembre de 2026.

---

## 1. Ajustes respecto al primer entregable

| Punto del primer entregable | Ajuste | Motivo |
|---|---|---|
| Protocolos de referencia: Manchester y CTAS | Se usa el **triage colombiano de cinco niveles (Resolución 5596 de 2015)**: I Rojo (atención inmediata), II Naranja (muy urgente), III Amarillo (urgente), IV Verde (leve, sin riesgo vital evidente), V Azul (no urgente). | El caso de estudio es una sala de urgencias en Colombia. |
| Límites de tiempo del modelo (10/60/120/240 min) | I inmediata (se tolera 1 min por el paso de simulación), II ≤ 30 min, III 120 min, IV 240 min, V 360 min. | I y II vienen de la norma; III es el tope de la franja de 1 a 2 h; **IV y V son supuestos** que se reemplazarán con el texto oficial o con datos del hospital. |
| Solo operación habitual | Se agrega el análisis de **catástrofe con múltiples víctimas**. | La norma exime los tiempos de espera en desastres; interesa saber qué hace el hospital cuando se llenan camas, médicos y enfermeras. |
| "Estrategia más costo-eficiente" por comparación manual | Se agrega un **optimizador** que barre combinaciones de recursos con los mismos pacientes. | Hace operativo el objetivo 4. |

---

## 2. Objetivos específicos

### OE1. Caracterizar las variables estocásticas del sistema

**Alcance.** Identificar las distribuciones de probabilidad de los tiempos entre arribos, del tiempo de clasificación en triage y del tiempo de atención médica por nivel de urgencia.

**Indicador de cumplimiento.** Distribución elegida para cada variable con su prueba de bondad de ajuste (Kolmogórov-Smirnov) y parámetros estimados por máxima verosimilitud.

**Evidencia.**
- `urgencias/caracterizacion.py` ajusta distribuciones candidatas por máxima verosimilitud y las contrasta con KS (`python main.py ajustar datos.csv columna`).
- Supuestos vigentes en `Config` (`urgencias/modelo.py`): llegadas como proceso de Poisson no homogéneo (perfil horario de 24 valores), tiempos de triaje y consulta lognormales (media 6 min con cv 0,4; consulta de 45, 40, 28, 16 y 10 min con cv 0,6 para los niveles I a V) y proporción por nivel de 3 %, 12 %, 35 %, 40 % y 10 %.

**Estado: parcial.** El código existe, pero los parámetros son **supuestos razonables y no datos de un hospital**.
**Pendiente:** conseguir datos reales (o una muestra anonimizada) y ejecutar el ajuste sobre ellos.

### OE2. Construir el modelo conceptual y computacional del sistema de colas

**Alcance.** Representar la secuencia ingreso → triage → valoración médica → observación → salida con disciplinas de prioridad no apropiativa y apropiativa.

**Indicador de cumplimiento.** Modelo ejecutable que reproduce el flujo completo y permite activar o desactivar la prioridad apropiativa.

**Evidencia.**
- `urgencias/modelo.py` en SimPy: triage con cola FIFO, consulta con cola por prioridad (nivel I primero), prioridad apropiativa opcional con retoma del tiempo restante, observación con cola por prioridad.
- `juego/js/motor/sim.js`: segundo motor, independiente, usado por el simulador visual. Incorpora además el deterioro de la salud del paciente en espera, el abandono de pacientes leves, el plan de desastre, el refuerzo de personal y camas, y la derivación a otros hospitales.

**Estado: cumplido en el modelo base.** Pendiente confirmar que los dos motores dan resultados coherentes con una misma configuración.

### OE3. Validar estadísticamente el comportamiento del modelo simulado

**Alcance.** Contrastar longitud media de colas, tiempos de espera y utilización con parámetros operativos de referencia.

**Indicador de cumplimiento.** Error relativo menor al 10 % frente a una solución analítica y concordancia con la ley de Little; contraste con datos históricos cuando existan.

**Evidencia (ejecución del 4 de noviembre de 2026, `python main.py validar`).**

| Prueba | Resultado |
|---|---|
| Cola M/M/3 contra Erlang C | Wq teórico 1,893 min · simulado 1,889 ± 0,052 min → coincide |
| Ley de Little (L = λ·W) | L medida 13,075 · λ·W 12,402 → error 5,1 % |

`urgencias/validacion.py` incluye además `contrastar_historico`, que compara la simulación con datos reales mediante KS.

**Estado: parcial.** La validación contra teoría está hecha. **Pendiente** la validación contra datos históricos de un hospital.

### OE4. Experimentar con escenarios prospectivos y determinar la estrategia más costo-eficiente

**Alcance.** Evaluar refuerzo de personal médico en horas pico, redistribución de consultorios y cambios de protocolo de triage.

**Indicador de cumplimiento.** Tabla comparativa con intervalo de confianza del 95 % y recomendación de la estrategia más barata que cumple la meta (≥ 90 % de pacientes de niveles I a III dentro de su tiempo máximo).

**Evidencia (`python main.py escenarios --reps 8`, con los límites de triage ya ajustados).**

| Escenario | Cumplimiento niveles I-III | Espera media nivel III (min) | Utilización de médicos | Costo por día (COP) |
|---|---|---|---|---|
| Base | 71,3 % | 29,7 | 81,9 % | 5 160 000 |
| Refuerzo pico +1 médico | 79,8 % | 10,4 | 69,8 % | 5 610 000 |
| Refuerzo pico +2 médicos | 86,1 % | 5,2 | 61,8 % | 6 060 000 |
| **Triage apropiativo** | **99,0 %** | 23,3 | 81,9 % | **5 160 000** |
| +1 enfermera de triage | 71,3 % | 30,1 | 81,9 % | 5 640 000 |
| +1 consultorio fijo | 83,0 % | 7,2 | 61,4 % | 6 240 000 |
| +4 camas de observación | 71,3 % | 29,7 | 81,9 % | 5 640 000 |
| Refuerzo +1 médico y apropiativo | 100,0 % | 8,3 | 69,8 % | 5 610 000 |

**Lectura.** La atención apropiativa cumple la meta sin aumentar el costo, mientras que añadir enfermeras o camas no mejora nada porque el cuello de botella son los médicos. Esta conclusión depende de los supuestos de OE1 y debe repetirse con datos reales.

**Extensión: catástrofe con múltiples víctimas.** El simulador visual (`juego/`) permite elegir el suceso, el número de víctimas **por nivel de triage** y los recursos disponibles. Con 100 víctimas en un accidente, sin plan de desastre murieron 41 pacientes; con plan, derivación de leves y atención apropiativa murieron 16 (misma semilla, mismos pacientes). Estos números son de una corrida de prueba y no un resultado definitivo.

**Estado: cumplido en operación habitual; en desarrollo para catástrofes.**

---

## 3. Registro de avance

| Fecha | Qué se hizo |
|---|---|
| Previo a nov. 2026 | Modelo SimPy (`urgencias/`), línea de comandos (`main.py`), interfaz gráfica (`gui.py`), validación M/M/c y Little, escenarios prospectivos y gráficas en `resultados/`. |
| 4 nov. 2026 | Se crea el **simulador visual de urgencias** (`juego/`): hospital en planta con pacientes, médicos, enfermeras, ambulancias, camas y bitácora; escenarios de catástrofe (accidente, sismo, bus, incendio, brote); barra lateral con pestañas **Simulación**, **Resultados** y **Recomendaciones**. |
| 4 nov. 2026 | Se separa el código en carpetas: `motor/` (modelo), `vista/` (dibujo), `analisis/` (recomendaciones y optimización), `ui/` (controles y paneles), `css/`. |
| 4 nov. 2026 | Se ajusta la nomenclatura al triage colombiano (Res. 5596/2015) en el juego, en `urgencias/modelo.py`, en las gráficas y en el README. Se regeneran `resultados/escenarios.csv` y `escenarios.png` con los nuevos límites. |
| 4 nov. 2026 | Se agrega el control de **víctimas por nivel de triage**, botones − / + para médicos, enfermeras y camas, y la derivación de pacientes leves cuando el hospital se desborda. |
| 4 nov. 2026 | Se agrega el **optimizador de recursos** (pestaña Optimización): barre 140 combinaciones de médicos, enfermeras y camas con los mismos pacientes y entrega la más barata que cumple la meta, además de la frontera costo-efectividad. Se agrega el comando `python juego.py` para abrir el simulador. |

---

## 4. Pendientes y riesgos

1. **Datos reales.** Sin ellos, OE1 y OE3 quedan sustentados solo en supuestos. Es el punto débil más importante ante el jurado.
2. **Tiempos de triage IV y V.** Confirmar con el texto oficial de la Resolución 5596 de 2015 o con la política del hospital estudiado.
3. **Dos motores.** Alinear `modelo.py` (SimPy) con `sim.js` o, como mínimo, comparar sus resultados en una configuración común y documentar las diferencias.
4. **Simulador visual.** El diseño está completo pero **aún no se ha revisado en pantalla ni probado con usuarios**. Se debe verificar el comportamiento en el navegador antes de presentarlo.
5. **Optimizador.** Revisar con el profesor el criterio de "cumple": hoy es cero fallecidos en triage I-III y un porcentaje mínimo de pacientes I-III atendidos a tiempo. Con muchas víctimas llegando a la vez ninguna combinación realista lo alcanza, lo que es coherente con que la norma exima esos tiempos en desastres.
