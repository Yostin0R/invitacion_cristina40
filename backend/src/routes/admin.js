const express = require('express');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const { query, queryOne, queryAll } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

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

async function getEventoId() {
  const evento = await queryOne('SELECT id_evento FROM evento LIMIT 1');
  return evento?.id_evento;
}

router.get('/estadisticas', async (req, res) => {
  try {
    const eventoId = await getEventoId();
    if (!eventoId) return res.status(404).json({ error: 'No hay evento configurado' });

    const total = Number((await queryOne(
      'SELECT COUNT(*)::int as count FROM invitado WHERE id_evento = $1 AND activo = TRUE',
      [eventoId]
    )).count);

    const confirmados = Number((await queryOne(
      `SELECT COUNT(*)::int as count FROM invitado i
       JOIN confirmacion c ON i.id_invitado = c.id_invitado
       WHERE i.id_evento = $1 AND i.activo = TRUE AND c.asistira = TRUE`,
      [eventoId]
    )).count);

    const noAsisten = Number((await queryOne(
      `SELECT COUNT(*)::int as count FROM invitado i
       JOIN confirmacion c ON i.id_invitado = c.id_invitado
       WHERE i.id_evento = $1 AND i.activo = TRUE AND c.asistira = FALSE`,
      [eventoId]
    )).count);

    const pendientes = total - confirmados - noAsisten;

    const totalAsistentes = Number((await queryOne(
      `SELECT COALESCE(SUM(1 + c.numero_acompanantes), 0)::int as total FROM invitado i
       JOIN confirmacion c ON i.id_invitado = c.id_invitado
       WHERE i.id_evento = $1 AND i.activo = TRUE AND c.asistira = TRUE`,
      [eventoId]
    )).total);

    res.json({ total, confirmados, noAsisten, pendientes, totalAsistentes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

router.get('/invitados', async (req, res) => {
  try {
    const eventoId = await getEventoId();
    const { buscar, estado } = req.query;

    let sql = `
      SELECT i.id_invitado, i.nombre, i.telefono, i.token_invitacion,
             i.acompanantes_permitidos, i.estado_envio, i.activo,
             c.asistira, c.numero_acompanantes, c.mensaje, c.fecha_confirmacion
      FROM invitado i
      LEFT JOIN confirmacion c ON i.id_invitado = c.id_invitado
      WHERE i.id_evento = $1 AND i.activo = TRUE
    `;
    const params = [eventoId];

    if (buscar) {
      params.push(`%${buscar}%`);
      sql += ` AND i.nombre ILIKE $${params.length}`;
    }

    sql += ' ORDER BY i.nombre ASC';

    let invitados = await queryAll(sql, params);

    invitados = invitados.map((inv) => {
      let estadoInvitado = 'pendiente';
      if (inv.fecha_confirmacion) {
        estadoInvitado = inv.asistira ? 'confirmado' : 'no_asiste';
      }
      return {
        ...inv,
        estado_invitado: estadoInvitado,
        asistira: inv.asistira != null ? !!inv.asistira : null,
      };
    });

    if (estado) {
      invitados = invitados.filter((inv) => inv.estado_invitado === estado);
    }

    res.json(invitados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar invitados' });
  }
});

function parseAcompanantesPermitidos(value, fallback = 2) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return Math.min(10, Math.floor(n));
}

router.post('/invitados', async (req, res) => {
  try {
    const eventoId = await getEventoId();
    const { nombre, telefono, acompanantes_permitidos } = req.body;

    if (!nombre?.trim()) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    const token = uuidv4().replace(/-/g, '').slice(0, 12);
    const maxAcompanantes = parseAcompanantesPermitidos(acompanantes_permitidos, 2);

    const result = await queryOne(
      `INSERT INTO invitado (id_evento, nombre, telefono, token_invitacion, acompanantes_permitidos)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_invitado`,
      [eventoId, nombre.trim(), telefono || '', token, maxAcompanantes]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    res.status(201).json({
      id_invitado: result.id_invitado,
      nombre: nombre.trim(),
      token_invitacion: token,
      enlace: `${frontendUrl}/invitacion/${token}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear invitado' });
  }
});

router.put('/invitados/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, telefono, acompanantes_permitidos, asistira, numero_acompanantes, mensaje } = req.body;

    const invitado = await queryOne('SELECT * FROM invitado WHERE id_invitado = $1', [id]);
    if (!invitado) return res.status(404).json({ error: 'Invitado no encontrado' });

    const maxAcompanantes = Object.prototype.hasOwnProperty.call(req.body, 'acompanantes_permitidos')
      ? parseAcompanantesPermitidos(acompanantes_permitidos, invitado.acompanantes_permitidos)
      : Number(invitado.acompanantes_permitidos) || 0;

    await query(
      `UPDATE invitado
       SET nombre = $1, telefono = $2, acompanantes_permitidos = $3
       WHERE id_invitado = $4`,
      [
        (nombre && String(nombre).trim()) || invitado.nombre,
        telefono !== undefined ? (telefono || '') : invitado.telefono,
        maxAcompanantes,
        id,
      ]
    );

    const confirmacion = await queryOne('SELECT * FROM confirmacion WHERE id_invitado = $1', [id]);

    if (asistira !== undefined) {
      const acompRaw = asistira ? (Number(numero_acompanantes) || 0) : 0;
      const acomp = Math.min(Math.max(0, acompRaw), maxAcompanantes);

      if (confirmacion) {
        await query(
          `UPDATE confirmacion
           SET asistira = $1, numero_acompanantes = $2, mensaje = $3, ultima_actualizacion = NOW()
           WHERE id_invitado = $4`,
          [!!asistira, acomp, mensaje || confirmacion.mensaje || '', id]
        );
      } else {
        await query(
          `INSERT INTO confirmacion (id_invitado, asistira, numero_acompanantes, mensaje)
           VALUES ($1, $2, $3, $4)`,
          [id, !!asistira, acomp, mensaje || '']
        );
      }
    } else if (confirmacion && Number(confirmacion.numero_acompanantes) > maxAcompanantes) {
      // Si se baja el cupo (p. ej. a 0), recortar acompañantes ya confirmados
      await query(
        `UPDATE confirmacion
         SET numero_acompanantes = $1, ultima_actualizacion = NOW()
         WHERE id_invitado = $2`,
        [maxAcompanantes, id]
      );
    }

    res.json({ mensaje: 'Invitado actualizado', acompanantes_permitidos: maxAcompanantes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar invitado' });
  }
});

router.delete('/invitados/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE invitado SET activo = FALSE WHERE id_invitado = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Invitado no encontrado' });
    }

    res.json({ mensaje: 'Invitado eliminado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar invitado' });
  }
});

router.get('/evento', async (req, res) => {
  try {
    const eventoRow = await queryOne('SELECT * FROM evento LIMIT 1');
    if (!eventoRow) return res.json({ evento: null, configuracion: null, fotografias: [] });

    const evento = {
      ...eventoRow,
      fecha_evento: formatearFecha(eventoRow.fecha_evento),
      hora_inicio: formatearHora(eventoRow.hora_inicio),
      hora_fin: formatearHora(eventoRow.hora_fin),
      fecha_limite_confirmacion: formatearFecha(eventoRow.fecha_limite_confirmacion),
    };

    const config = await queryOne('SELECT * FROM configuracion WHERE id_evento = $1', [evento.id_evento]);
    const fotografias = await queryAll(
      `SELECT * FROM fotografia WHERE id_evento = $1 ORDER BY orden ASC`,
      [evento.id_evento]
    );

    res.json({ evento, configuracion: config, fotografias });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el evento' });
  }
});

router.put('/evento', async (req, res) => {
  try {
    const evento = await queryOne('SELECT * FROM evento LIMIT 1');
    if (!evento) return res.status(404).json({ error: 'No hay evento' });

    const eventoInput = req.body.evento || req.body;
    const configInput = req.body.configuracion || {};
    const fotosInput = Array.isArray(req.body.fotografias) ? req.body.fotografias : [];

    const campos = [
      'titulo', 'homenajeada', 'descripcion', 'fecha_evento', 'hora_inicio', 'hora_fin',
      'lugar', 'direccion', 'url_mapa', 'codigo_vestimenta', 'fecha_limite_confirmacion', 'mensaje_regalos',
    ];

    const updates = [];
    const values = [];
    for (const campo of campos) {
      if (eventoInput[campo] !== undefined) {
        values.push(eventoInput[campo]);
        updates.push(`${campo} = $${values.length}`);
      }
    }

    if (updates.length > 0) {
      values.push(evento.id_evento);
      await query(`UPDATE evento SET ${updates.join(', ')} WHERE id_evento = $${values.length}`, values);
    }

    const configCampos = [
      'color_principal', 'color_secundario', 'tipografia', 'url_musica', 'imagen_portada', 'musica_activa',
    ];
    const configUpdates = [];
    const configValues = [];

    for (const campo of configCampos) {
      if (configInput[campo] !== undefined) {
        configValues.push(campo === 'musica_activa' ? !!configInput[campo] : configInput[campo]);
        configUpdates.push(`${campo} = $${configValues.length}`);
      }
    }

    if (configUpdates.length > 0) {
      const existeConfig = await queryOne(
        'SELECT id_configuracion FROM configuracion WHERE id_evento = $1',
        [evento.id_evento]
      );

      if (existeConfig) {
        configValues.push(evento.id_evento);
        await query(
          `UPDATE configuracion SET ${configUpdates.join(', ')} WHERE id_evento = $${configValues.length}`,
          configValues
        );
      } else {
        await query(
          `INSERT INTO configuracion (id_evento, color_principal, color_secundario, tipografia, url_musica, imagen_portada, musica_activa)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            evento.id_evento,
            configInput.color_principal || '#6B2233',
            configInput.color_secundario || '#C5A05D',
            configInput.tipografia || 'Playfair Display',
            configInput.url_musica || '',
            configInput.imagen_portada || '',
            !!configInput.musica_activa,
          ]
        );
      }
    }

    for (const foto of fotosInput) {
      if (!foto.url_imagen) continue;

      if (foto.id_fotografia) {
        await query(
          `UPDATE fotografia
           SET url_imagen = $1, descripcion = $2, etapa = $3, orden = $4, activa = $5
           WHERE id_fotografia = $6 AND id_evento = $7`,
          [
            foto.url_imagen,
            foto.descripcion || '',
            foto.etapa || '',
            foto.orden || 0,
            foto.activa === false ? false : true,
            foto.id_fotografia,
            evento.id_evento,
          ]
        );
      } else {
        await query(
          `INSERT INTO fotografia (id_evento, url_imagen, descripcion, etapa, orden, activa)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            evento.id_evento,
            foto.url_imagen,
            foto.descripcion || '',
            foto.etapa || '',
            foto.orden || 0,
            foto.activa === false ? false : true,
          ]
        );
      }
    }

    res.json({ mensaje: 'Evento actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el evento' });
  }
});

router.delete('/fotografias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM fotografia WHERE id_fotografia = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Fotografía no encontrada' });
    }

    res.json({ mensaje: 'Fotografía eliminada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la fotografía' });
  }
});

router.get('/mensajes', async (req, res) => {
  try {
    const eventoId = await getEventoId();
    const mensajes = await queryAll(
      `SELECT i.nombre, c.mensaje, c.asistira, c.fecha_confirmacion
       FROM confirmacion c
       JOIN invitado i ON c.id_invitado = i.id_invitado
       WHERE i.id_evento = $1 AND c.mensaje IS NOT NULL AND c.mensaje != ''
       ORDER BY c.fecha_confirmacion DESC`,
      [eventoId]
    );

    res.json(mensajes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

router.get('/exportar', async (req, res) => {
  try {
    const eventoId = await getEventoId();
    const formato = req.query.formato || 'csv';

    const datos = await queryAll(
      `SELECT i.nombre, i.telefono,
              CASE WHEN c.id_confirmacion IS NULL THEN 'Pendiente'
                   WHEN c.asistira = TRUE THEN 'Confirmado'
                   ELSE 'No asistirá' END as estado,
              COALESCE(c.numero_acompanantes, 0) as acompanantes,
              CASE WHEN c.asistira = TRUE THEN 1 + COALESCE(c.numero_acompanantes, 0) ELSE 0 END as total_personas,
              c.mensaje, c.fecha_confirmacion
       FROM invitado i
       LEFT JOIN confirmacion c ON i.id_invitado = c.id_invitado
       WHERE i.id_evento = $1 AND i.activo = TRUE
       ORDER BY i.nombre`,
      [eventoId]
    );

    const rows = datos.map((d) => ({
      Nombre: d.nombre,
      Teléfono: d.telefono,
      Estado: d.estado,
      Acompañantes: d.acompanantes,
      'Total personas': d.total_personas,
      Mensaje: d.mensaje || '',
      'Fecha respuesta': d.fecha_confirmacion || '',
    }));

    if (formato === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Invitados');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=invitados.xlsx');
      return res.send(buffer);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=invitados.csv');
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

module.exports = router;
