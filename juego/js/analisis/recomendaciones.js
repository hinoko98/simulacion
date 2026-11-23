/* ANÁLISIS: genera recomendaciones a partir de los resultados de una corrida,
 * organizadas por nivel de triaje Manchester. Sin DOM: devuelve datos puros. */
(function (root) {
  'use strict';
  const S = root.UrgSim;
  const { NOMBRE, NIVELES, ROMANO, DESC } = S;

  const PROTOCOLO = {
    1: { accion: 'Atención inmediata en sala de reanimación; ingreso directo desde ambulancia sin pasar por la fila de triaje.', rol: 'Médico + enfermera dedicados' },
    2: { accion: 'Muy urgente: valoración médica en ≤30 min (idealmente antes); puede interrumpir consultas de menor prioridad (atención apropiativa).', rol: 'Médico de turno' },
    3: { accion: 'Urgente: atención en 1-2 h; reevaluar el nivel de la sala de espera cada 15–20 min porque pueden deteriorarse.', rol: 'Enfermería de reevaluación' },
    4: { accion: 'Leve, sin riesgo vital evidente. Ruta rápida (fast-track): atención por médico general o enfermera de práctica avanzada, fuera de los boxes críticos.', rol: 'Consultorio de baja complejidad' },
    5: { accion: 'No urgente. Derivar a primer nivel/consulta externa o resolver por teleconsulta durante la catástrofe.', rol: 'Derivación / teleconsulta' },
  };

  const f0 = (x) => Math.round(x);

  /** Semáforo por nivel: 'ok' | 'aviso' | 'critico' */
  function estadoNivel(n, r) {
    const l = r.porNivel[n];
    if (l.llegados === 0) return 'ok';
    if (l.muertos > 0 && n <= 3) return 'critico';
    if (l.cumple < 50 || (l.abandonos / l.llegados > 0.3)) return 'critico';
    if (l.cumple < 80 || l.abandonos > 0) return 'aviso';
    return 'ok';
  }

  /** Mejor y peor corrida comparable (mismo escenario y semilla) distinta de la actual. */
  function comparable(corrida, historial) {
    return historial.filter(h => h.id !== corrida.id && h.cfg.escenario === corrida.cfg.escenario && h.cfg.semilla === corrida.cfg.semilla);
  }

  function generar(corrida, historial) {
    const r = corrida.res, c = corrida.cfg, pn = r.porNivel;
    const recs = [];
    // recurso: 'medicos' | 'enfermeras' | 'camas' cuando la recomendación consiste en añadir ese recurso (la optimización manda sobre ella)
    const add = (prio, titulo, detalle, niveles, impacto, recurso) => recs.push({ prio, titulo, detalle, niveles: niveles || [], impacto: impacto || '', recurso: recurso || null });
    const evento = r.eventoT !== null;

    const muertosGraves = pn[1].muertos + pn[2].muertos;
    const muertosTriajeG = pn[1].muertosTriaje + pn[2].muertosTriaje + pn[3].muertosTriaje;
    const muertosColaG = pn[1].muertosCola + pn[2].muertosCola + pn[3].muertosCola;
    const abandonosLeves = pn[4].abandonos + pn[5].abandonos;
    const llegLeves = pn[4].llegados + pn[5].llegados;

    // 1. Fallecidos antes de ser clasificados -> problema de triaje
    if (muertosTriajeG > 0) {
      add(1, c.plan ? 'Acortar aún más la clasificación inicial' : 'Activar triaje rápido (START) desde el primer minuto',
        `${muertosTriajeG} paciente(s) grave(s) fallecieron antes de ser clasificados: la fila de triaje era FIFO y los rojos esperaron detrás de casos leves. ` +
        (c.plan ? 'El plan ya redujo el tiempo de triaje, pero se activó tras la llegada de los primeros heridos: adelanta la activación (código naranja automático al recibir la alerta).'
          : 'Con el plan de desastre el triaje baja de ~6 a ~2,5 min y los rojos/naranjas en ambulancia entran directo.'),
        [1, 2, 3], 'Alto: es la causa de muerte evitable más directa.');
    }
    if (r.picoColaT >= 15 || (c.enfermeras <= 2 && r.picoColaT >= 8)) {
      add(2, 'Ampliar la capacidad de triaje',
        `Hubo hasta ${r.picoColaT} personas esperando triaje con ${c.enfermeras} enfermeras base (utilización ${f0(r.util.enfermeras)} %). ` +
        'Asigna una enfermera de triaje por cada ~20 pacientes/hora esperados, y un segundo punto de clasificación en la entrada de ambulancias.',
        [1, 2, 3, 4, 5], 'Reduce el tiempo hasta la primera clasificación.', 'enfermeras');
    }

    // 2. Fallecidos esperando al médico -> capacidad médica / priorización
    if (muertosColaG > 0) {
      add(1, c.apropiativa ? 'Reforzar médicos para casos críticos' : 'Habilitar atención apropiativa para rojos y naranjas',
        `${muertosColaG} paciente(s) grave(s) fallecieron ya clasificados, esperando al médico (utilización de médicos ${f0(r.util.medicos)} %). ` +
        (c.apropiativa ? 'La interrupción de consultas (' + r.interrup + ' veces) no bastó: faltan manos. Convoca refuerzo médico en ≤30 min y dedica un equipo exclusivo a reanimación.'
          : 'Sin apropiación, un rojo debe esperar a que termine una consulta leve. Permite interrumpir a niveles 3-5 cuando entre un nivel 1-2.'),
        [1, 2], 'Alto: evita muertes de pacientes ya identificados como críticos.', c.apropiativa ? 'medicos' : null);
    }

    // 3. Cumplimiento de tiempos por nivel
    for (const n of [1, 2, 3]) {
      const l = pn[n];
      if (l.llegados > 0 && l.cumple < 70 && l.muertos === 0) {
        add(2, `Triage ${ROMANO[n]} (${NOMBRE[n]}): solo ${f0(l.cumple)} % atendido dentro del límite`,
          `Espera media ${f0(l.espMedia)} min (P90 ${f0(l.espP90)}) frente a un límite de ${l.limite} min. ` +
          (n <= 2 ? 'Reserva al menos 1 box permanente para rojos/naranjas y usa llamada automática de refuerzo cuando la cola supere 3 pacientes.'
            : 'Reevalúa periódicamente a los amarillos en espera y mueve los que empeoren a naranja.'),
          [n], 'Medio');
      }
    }

    // 4. Niveles bajos: abandono -> fast-track
    if (llegLeves > 0 && abandonosLeves / llegLeves > 0.25) {
      add(3, 'Crear ruta rápida para verdes y azules',
        `${abandonosLeves} de ${llegLeves} pacientes verdes/azules (${f0(100 * abandonosLeves / llegLeves)} %) se fueron sin ser atendidos. ` +
        'Una ruta paralela con médico general o enfermera de práctica avanzada, o la derivación a primer nivel, libera boxes para los graves y reduce el abandono.',
        [4, 5], 'Medio: descongestiona la sala y evita el riesgo de que se vayan casos mal clasificados.');
    }

    // 5. Camas / observación
    const picoColaC = Math.max(0, ...r.serie.map(s => s.colaC));
    if (r.util.camas > 85 || picoColaC >= 5) {
      add(2, 'Liberar camas de observación',
        `Camas al ${f0(r.util.camas)} % y hasta ${picoColaC} pacientes esperando cama en pasillo. ` +
        (c.plan ? 'Aun con camas de sobrecarga, conviene dar altas tempranas a verdes/amarillos estables y trasladar pacientes a otros hospitales (red de referencia).'
          : 'Define camas de sobrecarga (+6) y altas tempranas para pacientes estables; el plan de desastre las habilita automáticamente.'),
        [2, 3], 'Medio: un paciente en el pasillo sigue ocupando al médico que podría estar viendo a otro.', 'camas');
    }

    // 6. Cuello de botella general
    const util = r.util, mx = Object.entries(util).sort((a, b) => b[1] - a[1])[0];
    if (mx[1] > 90 && evento) {
      const nom = { medicos: 'los médicos', enfermeras: 'las enfermeras de triaje', camas: 'las camas' }[mx[0]];
      add(2, `Cuello de botella: ${nom}`, `Utilización de ${f0(mx[1])} % durante la corrida. Con este escenario, ${nom} se saturan; ese recurso es el que más impacto tiene por unidad añadida.`, [], 'Medio', mx[0]);
    }

    // 7. Plan de desastre
    if (evento && !c.plan) {
      add(1, 'Activar el plan de desastre',
        'Esta corrida no usó el plan. Vuelve a ejecutar el mismo escenario y semilla con el plan activo: añade triaje rápido, ingreso directo, refuerzo de personal y camas.',
        [1, 2, 3], 'Alto');
    }
    if (evento && c.plan && r.planT !== null) {
      add(3, 'Reducir la demora de activación del plan',
        'El plan se activó 10 min después de la alerta y los refuerzos llegaron entre 20 y 40 min más tarde. Un listado de personal localizable (llamada en cadena) y un simulacro trimestral reducen esa latencia.',
        [], 'Medio');
    }

    // 8. Comparación con otras corridas del mismo escenario
    const otras = comparable(corrida, historial);
    let comparacion = null;
    if (otras.length) {
      const mejor = otras.reduce((a, b) => (b.res.muertos < a.res.muertos ? b : a));
      comparacion = { muertosActual: r.muertos, muertosOtra: mejor.res.muertos, plan: mejor.cfg.plan, apropiativa: mejor.cfg.apropiativa,
        medicos: mejor.cfg.medicos, enfermeras: mejor.cfg.enfermeras, camas: mejor.cfg.camas };
    }

    // 8b. Desborde: qué hacer cuando camas / médicos / enfermeras se llenan
    const picoCamas = Math.max(0, ...r.serie.map(s => s.camas));
    const razones = [];
    if (r.util.medicos > 90 && r.picoColaD >= 2 * c.medicos) razones.push(`los ${c.medicos} médicos base trabajaron al ${f0(r.util.medicos)} % con hasta ${r.picoColaD} pacientes en cola`);
    if (r.util.enfermeras > 85 && r.picoColaT >= 8) razones.push(`triaje llegó a ${r.picoColaT} personas en espera`);
    if (picoCamas >= c.camas || picoColaC >= 3) razones.push(`las camas de observación se llenaron (${picoColaC} pacientes esperando cama)`);
    const desborde = {
      saturado: evento && razones.length > 0, razones,
      derivados: r.derivados, abandonos: r.abandonos,
      pasos: [
        { n: 'Todos', txt: 'Declarar código de desastre al recibir la alerta y hacer triaje START en la puerta: clasificar en segundos, no en minutos.' },
        { n: 1, txt: 'Rojos: todos los recursos disponibles. Un equipo (médico + enfermera) exclusivo y box de reanimación permanente.' },
        { n: 2, txt: 'Naranjas: segundo en la fila. Si no hay médico libre, interrumpir consultas de niveles 3-5 (atención apropiativa).' },
        { n: 3, txt: 'Amarillos: atención diferida y reevaluación cada 15–20 min; si empeoran suben a naranja. Candidatos a derivación solo en colapso total.' },
        { n: '4-5', txt: 'Verdes y azules: no ocupar boxes. Derivarlos a otros hospitales, centros de primer nivel o sala de atención ambulatoria improvisada.' },
        { n: 'Camas', txt: 'Altas tempranas a pacientes estables, habilitar camas de sobrecarga (pasillos) y trasladar pacientes estables a la red de referencia.' },
        { n: 'Personal', txt: 'Convocar refuerzo (llamada en cadena) y reasignar enfermeras de otros servicios al triaje; el médico más experimentado hace de director de triaje.' },
      ],
    };
    if (desborde.saturado && !c.derivar) {
      add(1, 'Derivar pacientes leves cuando el hospital se desborda',
        `${desborde.razones.join('; ')}. Sin derivación, ${r.abandonos} pacientes se fueron sin atención y los verdes/azules ocuparon espacio y personal. Activa "Derivar leves si hay desborde": los niveles 4-5 se redirigen a otros hospitales y se protege la capacidad para rojos y naranjas.`,
        [4, 5], 'Alto: libera médicos y camas para los graves.');
    } else if (desborde.saturado) {
      add(2, 'Capacidad desbordada: prepara la red de referencia',
        `${desborde.razones.join('; ')}. Se derivaron ${r.derivados} pacientes. Acuerda de antemano qué hospitales reciben desbordes, con cuántas camas y por qué ambulancias; sin ese convenio la derivación se improvisa y se pierde tiempo.`,
        [3, 4, 5], 'Alto');
    }

    // 8c. Optimización de la respuesta (refuerzos) hecha sobre esta misma corrida. Formatos viejos de `opt` se ignoran.
    let optimo = null;
    if (corrida.opt && corrida.opt.version === 2) {
      const o = corrida.opt, f = o.final, ini = o.inicial;
      const NOM = { medicos: ['médico', 'médicos'], enfermeras: ['enfermera de triaje', 'enfermeras de triaje'], camas: ['cama de sobrecarga', 'camas de sobrecarga'] };
      const nom = (k, n) => `${n} ${NOM[k][n === 1 ? 0 : 1]}`;
      const refuerzos = ['medicos', 'enfermeras', 'camas'].filter(k => f.ref[k] > 0).map(k => ({ recurso: k, n: f.ref[k] }));
      const dem = (L) => (o.demora || []).find(x => x.llamada === L);
      const costoDemora = dem(0) && dem(30) ? dem(30).muertosG - dem(0).muertosG : 0;
      const muertesEvitadas = ini.muertosG - f.muertosG;
      optimo = Object.assign({}, o, { refuerzos, costoDemora, muertesEvitadas });
      const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString('es-CO');
      const cop = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('es-CO');
      const y = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]);
      const lista = y(refuerzos.map(x => nom(x.recurso, x.n)));
      const pasos = o.pasos.filter(p => p.cambio > 0).map(p => `${p.decision} (${p.porque})`).join('; ');
      const compara = `Con el plan activo y sin refuerzos: ${f1(ini.muertosG)} fallecidos I-III y ${f0(ini.cumpleG)} % a tiempo. ` +
        `Con la respuesta ${o.cumpleMeta ? 'óptima' : 'más cercana a la meta'}: ${f1(f.muertosG)} fallecidos I-III y ${f0(f.cumpleG)} % a tiempo ` +
        `(meta ${o.meta} %, promedio de ${o.replicas} réplicas con los mismos pacientes).` + (pasos ? ` Pasos guiados por los resultados: ${pasos}.` : '');
      const demoraTxt = costoDemora >= 0.1 ? ` Convocar a los 30 min en lugar de al recibir la alerta cuesta ${f1(costoDemora)} fallecidos graves más: la llamada debe salir con la alerta.` : '';
      const impacto = (muertesEvitadas > 0 ? `Alto: evita ${f1(muertesEvitadas)} fallecidos graves; ` : '') + `refuerzos por ${cop(f.costo)} en el turno.`;
      if (!refuerzos.length && o.cumpleMeta) {
        add(3, 'Con el plan activo no hacen falta refuerzos', compara + ' La plantilla base basta: concentra las mejoras en el protocolo (triaje, activación del plan, derivación).' + demoraTxt, [], '');
      } else if (!refuerzos.length) {
        add(1, 'Los refuerzos disponibles no mejoran el resultado: reducir la demanda',
          compara + ' Ningún refuerzo adicional mejoró los indicadores: deriva leves, activa la red de referencia y adelanta el plan.' + demoraTxt, [1, 2, 3], 'Alto');
      } else if (o.cumpleMeta) {
        add(1, `Convocar ${lista} al activar el plan`, compara + demoraTxt, [1, 2, 3], impacto);
      } else {
        add(1, `Ni con todos los refuerzos se cumple la meta: convocar ${lista} y reducir la demanda`,
          compara + ' Además de los refuerzos hay que derivar leves y usar la red de referencia.' + demoraTxt, [1, 2, 3], impacto);
      }
      // la optimización manda: fuera las recomendaciones de añadir un recurso que no hizo falta convocar
      for (let i = recs.length - 1; i >= 0; i--) {
        const k = recs[i].recurso;
        if (!k) continue;
        if (!f.ref[k]) recs.splice(i, 1);
        else recs[i].detalle += ` La optimización de esta catástrofe concreta: convocar ${nom(k, f.ref[k])}.`;
      }
    }

    // 9. Si todo va bien
    if (!recs.length) {
      add(3, 'Mantener el protocolo actual', 'No se detectaron fallos graves. Prueba un escenario más duro (sismo o incendio) o reduce el personal para encontrar el punto de quiebre.', [], '');
    }

    recs.sort((a, b) => a.prio - b.prio);
    const niveles = NIVELES.map(n => ({
      nivel: n, nombre: NOMBRE[n], romano: ROMANO[n], desc: DESC[n], estado: estadoNivel(n, r), datos: pn[n], protocolo: PROTOCOLO[n],
    }));
    return { recs, niveles, comparacion, desborde, optimo };
  }

  root.UrgRecomendaciones = { generar, PROTOCOLO };
})(window);
