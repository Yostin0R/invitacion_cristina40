const express = require('express');
const { query, queryOne, queryAll } = require('../db/database');

const router = express.Router();

function formatearFecha(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  return valor.toISOString().slice(0, 10);
}

function formatearHora(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 5);
  return String(valor).slice(0, 5);
}

async function getInvitacionCompleta(token) {
  const invitado = await queryOne(
    `SELECT i.*, e.titulo, e.homenajeada, e.descripcion, e.fecha_evento, e.hora_inicio,
            e.hora_fin, e.lugar, e.direccion, e.url_mapa, e.codigo_vestimenta,
            e.fecha_limite_confirmacion, e.mensaje_regalos, e.estado as estado_evento
     FROM invitado i
     JOIN evento e ON i.id_evento = e.id_evento
     WHERE i.token_invitacion = $1 AND i.activo = TRUE`,
    [token]
  );

  if (!invitado) return null;

  const config = await queryOne('SELECT * FROM configuracion WHERE id_evento = $1', [invitado.id_evento]);
  const fotos = await queryAll(
    `SELECT * FROM fotografia WHERE id_evento = $1 AND activa = TRUE ORDER BY orden ASC`,
    [invitado.id_evento]
  );
  const confirmacion = await queryOne('SELECT * FROM confirmacion WHERE id_invitado = $1', [invitado.id_invitado]);

  return { invitado, config, fotos, confirmacion };
}

async function registrarVisita(idInvitado, dispositivo) {
  const existente = await queryOne(
    `SELECT * FROM visita WHERE id_invitado = $1 ORDER BY fecha_visita DESC LIMIT 1`,
    [idInvitado]
  );

  if (existente) {
    await query(
      `UPDATE visita
       SET cantidad_visitas = cantidad_visitas + 1, fecha_visita = NOW(), dispositivo = $1
       WHERE id_visita = $2`,
      [dispositivo || 'desconocido', existente.id_visita]
    );
  } else {
    await query(
      `INSERT INTO visita (id_invitado, dispositivo) VALUES ($1, $2)`,
      [idInvitado, dispositivo || 'desconocido']
    );
  }
}

router.get('/:token', async (req, res) => {
  try {
    const data = await getInvitacionCompleta(req.params.token);

    if (!data) {
      return res.status(404).json({ error: 'Invitación no encontrada' });
    }

    await registrarVisita(data.invitado.id_invitado, req.headers['user-agent']);

    const { invitado, config, fotos, confirmacion } = data;
    const fechaLimite = formatearFecha(invitado.fecha_limite_confirmacion);
    const puedeConfirmar = new Date() <= new Date(`${fechaLimite}T23:59:59`);

    res.json({
      invitado: {
        nombre: invitado.nombre,
        acompanantes_permitidos: invitado.acompanantes_permitidos,
        token: invitado.token_invitacion,
      },
      evento: {
        titulo: invitado.titulo,
        homenajeada: invitado.homenajeada,
        descripcion: invitado.descripcion,
        fecha_evento: formatearFecha(invitado.fecha_evento),
        hora_inicio: formatearHora(invitado.hora_inicio),
        hora_fin: formatearHora(invitado.hora_fin),
        lugar: invitado.lugar,
        direccion: invitado.direccion,
        url_mapa: invitado.url_mapa,
        codigo_vestimenta: invitado.codigo_vestimenta,
        fecha_limite_confirmacion: fechaLimite,
        mensaje_regalos: invitado.mensaje_regalos,
      },
      configuracion: config,
      fotografias: fotos,
      confirmacion: confirmacion
        ? {
            asistira: !!confirmacion.asistira,
            numero_acompanantes: confirmacion.numero_acompanantes,
            mensaje: confirmacion.mensaje,
            fecha_confirmacion: confirmacion.fecha_confirmacion,
          }
        : null,
      puede_confirmar: puedeConfirmar,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar la invitación' });
  }
});

function validarConfirmacion(body, invitado) {
  const errores = [];

  if (body.asistira === undefined || body.asistira === null) {
    errores.push('Debes seleccionar si asistirás o no');
  }

  const asistira = !!body.asistira;
  let acompanantes = parseInt(body.numero_acompanantes, 10) || 0;
  const maxPermitidos = Number(invitado.acompanantes_permitidos) || 0;

  if (!asistira || maxPermitidos <= 0) {
    acompanantes = 0;
  } else if (acompanantes < 0) {
    errores.push('El número de acompañantes no puede ser negativo');
  } else if (acompanantes > maxPermitidos) {
    errores.push(`Máximo ${maxPermitidos} acompañante(s) permitido(s)`);
  }

  const fechaLimite = formatearFecha(invitado.fecha_limite_confirmacion);
  const puedeConfirmar = new Date() <= new Date(`${fechaLimite}T23:59:59`);
  if (!puedeConfirmar) {
    errores.push('La fecha límite para confirmar ha pasado');
  }

  return { errores, asistira, acompanantes };
}

async function guardarConfirmacion(idInvitado, asistira, acompanantes, mensaje, esActualizacion) {
  if (esActualizacion) {
    await query(
      `UPDATE confirmacion
       SET asistira = $1, numero_acompanantes = $2, mensaje = $3, ultima_actualizacion = NOW()
       WHERE id_invitado = $4`,
      [asistira, acompanantes, mensaje || '', idInvitado]
    );
  } else {
    await query(
      `INSERT INTO confirmacion (id_invitado, asistira, numero_acompanantes, mensaje)
       VALUES ($1, $2, $3, $4)`,
      [idInvitado, asistira, acompanantes, mensaje || '']
    );
  }
}

async function procesarConfirmacion(req, res) {
  try {
    const data = await getInvitacionCompleta(req.params.token);
    if (!data) {
      return res.status(404).json({ error: 'Invitación no encontrada' });
    }

    const { invitado, confirmacion } = data;
    const { errores, asistira, acompanantes } = validarConfirmacion(req.body, invitado);

    if (errores.length > 0) {
      return res.status(400).json({ error: errores.join('. ') });
    }

    await guardarConfirmacion(
      invitado.id_invitado,
      asistira,
      acompanantes,
      req.body.mensaje,
      !!confirmacion
    );

    res.json({
      mensaje: asistira ? '¡Gracias por confirmar tu asistencia!' : 'Gracias por responder',
      asistira,
      numero_acompanantes: acompanantes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la confirmación' });
  }
}

router.post('/:token/confirmar', procesarConfirmacion);
router.put('/:token/confirmar', procesarConfirmacion);

module.exports = router;
