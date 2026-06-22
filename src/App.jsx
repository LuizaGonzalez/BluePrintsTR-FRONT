import { useEffect, useRef, useState } from 'react'
import { createStompClient, subscribeBlueprint } from './lib/stompClient.js'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
const STOMP_BASE = import.meta.env.VITE_STOMP_BASE ?? 'http://localhost:8080'

export default function App() {
  const [tech, setTech] = useState('stomp')
  const [author, setAuthor] = useState('')
  const [name, setName] = useState('')
  const [blueprints, setBlueprints] = useState([])
  const [selectedBp, setSelectedBp] = useState(null)
  const [points, setPoints] = useState([])
  const [authorInput, setAuthorInput] = useState('Luiza')
  const [nameInput, setNameInput] = useState('')
  const [stompStatus, setStompStatus] = useState('desconectado')
  const [error, setError] = useState(null)

  const canvasRef = useRef(null)
  const stompRef = useRef(null)
  const unsubRef = useRef(null)

  function loadBlueprints(a) {
    if (!a) return
    setError(null)
    fetch(`${API_BASE}/api/v1/blueprints/${a}`)
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status} al cargar planos de ${a}`)
        return r.json()
      })
      .then(res => {
        const data = res.data ?? []
        if (data.length === 0) setError(`El autor "${a}" no tiene planos registrados`)
        setBlueprints(data)
      })
      .catch(err => {
        console.error('loadBlueprints error:', err)
        setError(err.message)
        setBlueprints([])
      })
  }

  function loadBlueprint(a, n) {
    setError(null)
    fetch(`${API_BASE}/api/v1/blueprints/${a}/${n}`)
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status} al cargar el plano ${a}/${n}`)
        return r.json()
      })
      .then(res => {
        const pts = res.data?.points ?? []
        setPoints(pts)
        drawAll(pts)
        console.log(`Plano ${a}/${n} cargado con ${pts.length} puntos`)
      })
      .catch(err => {
        console.error('loadBlueprint error:', err)
        setError(err.message)
      })
  }

  function selectBlueprint(bp) {
    setSelectedBp(bp)
    setAuthor(bp.author)
    setName(bp.name)
    loadBlueprint(bp.author, bp.name)
  }

  function drawAll(pts) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 600, 400)
    ctx.beginPath()
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2
    ctx.stroke()
    pts.forEach(p => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI)
      ctx.fillStyle = '#2563eb'
      ctx.fill()
    })
  }

  useEffect(() => {
    unsubRef.current?.unsubscribe?.()
    stompRef.current?.deactivate?.()
    setStompStatus('desconectado')

    if (!author || !name || tech !== 'stomp') return

    const client = createStompClient(STOMP_BASE)
    stompRef.current = client

    client.onConnect = () => {
      setStompStatus('conectado')
      console.log('STOMP conectado a /topic/blueprints.' + author + '.' + name)
      unsubRef.current = subscribeBlueprint(client, author, name, (upd) => {
        console.log('Mensaje recibido del servidor:', upd)
        if (!upd?.point) {
          console.warn('Mensaje recibido sin punto válido:', upd)
          return
        }
        setPoints(prev => {
          const newPoints = [...prev, upd.point]
          drawAll(newPoints)
          return newPoints
        })
      })
    }

    client.onDisconnect = () => {
      setStompStatus('desconectado')
      console.log('STOMP desconectado')
    }

    client.onStompError = (frame) => {
      setStompStatus('error')
      setError('Error de conexión STOMP: ' + frame.headers['message'])
      console.error('STOMP error:', frame)
    }

    client.onWebSocketError = () => {
      setStompStatus('error')
      setError('No se pudo conectar al servidor WebSocket. Verifica que el backend esté corriendo.')
      console.error('WebSocket error')
    }

    client.activate()

    return () => {
      unsubRef.current?.unsubscribe?.()
      stompRef.current?.deactivate?.()
      setStompStatus('desconectado')
    }
  }, [author, name, tech])

  useEffect(() => {
    drawAll(points)
  }, [points])

  function onCanvasClick(e) {
    if (!author || !name) return
    const rect = e.target.getBoundingClientRect()
    const point = {
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top)
    }

    if (tech === 'stomp') {
      if (!stompRef.current?.connected) {
        setError('STOMP no está conectado. Espera un momento o recarga la página.')
        return
      }
      console.log('Enviando punto via STOMP:', point)
      stompRef.current.publish({
        destination: '/app/draw',
        body: JSON.stringify({ author, name, point })
      })
    } else if (tech === 'none') {
      fetch(`${API_BASE}/api/v1/blueprints/${author}/${name}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(point)
      })
        .then(r => {
          if (!r.ok) throw new Error(`Error ${r.status} al agregar punto`)
          const newPoints = [...points, point]
          setPoints(newPoints)
          drawAll(newPoints)
        })
        .catch(err => {
          console.error('addPoint error:', err)
          setError(err.message)
        })
    } else if (tech === 'socketio') {
      setError('Socket.IO no está disponible en esta implementación. Selecciona STOMP o None.')
    }
  }

  function createBlueprint() {
    if (!authorInput || !nameInput) {
      setError('Completa el nombre del autor y del nuevo plano antes de crear')
      return
    }
    setError(null)
    fetch(`${API_BASE}/api/v1/blueprints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: authorInput, name: nameInput, points: [] })
    })
      .then(r => {
        if (r.status === 409) throw new Error(`Ya existe un plano llamado "${nameInput}" para el autor "${authorInput}"`)
        if (!r.ok) throw new Error(`Error ${r.status} al crear el plano`)
        return r.json()
      })
      .then(() => {
        console.log('Plano creado:', authorInput, nameInput)
        setNameInput('')
        loadBlueprints(authorInput)
      })
      .catch(err => {
        console.error('createBlueprint error:', err)
        setError(err.message)
      })
  }

  function saveBlueprint() {
    if (!author || !name) return
    setError(null)
    fetch(`${API_BASE}/api/v1/blueprints/${author}/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points })
    })
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status} al guardar el plano`)
        console.log('Plano guardado:', author, name)
        loadBlueprints(author)
      })
      .catch(err => {
        console.error('saveBlueprint error:', err)
        setError(err.message)
      })
  }

  function deleteBlueprint() {
    if (!author || !name) return
    if (!confirm(`¿Eliminar el plano "${name}" de ${author}?`)) return
    setError(null)
    const authorToReload = author
    fetch(`${API_BASE}/api/v1/blueprints/${author}/${name}`, { method: 'DELETE' })
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status} al eliminar el plano`)
        console.log('Plano eliminado:', author, name)
        setSelectedBp(null)
        setAuthor('')
        setName('')
        setPoints([])
        loadBlueprints(authorToReload)
      })
      .catch(err => {
        console.error('deleteBlueprint error:', err)
        setError(err.message)
      })
  }

  const totalPoints = blueprints.reduce((acc, bp) => acc + (bp.points?.length ?? 0), 0)
  const stompColor = stompStatus === 'conectado' ? '#16a34a' : stompStatus === 'error' ? '#dc2626' : '#d97706'

  return (
      <div style={{ fontFamily: 'Inter, system-ui', padding: 24, maxWidth: 1200 }}>

        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>

          {/* Columna izquierda */}
          <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <h2 style={{ marginBottom: 12 }}>BluePrints en Tiempo Real</h2>

              <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                <label style={{ fontWeight: 'bold', fontSize: 13 }}>Tecnología RT:</label>
                <select
                  value={tech}
                  onChange={e => { setTech(e.target.value); setError(null) }}
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}
                >
                  <option value="none">None (solo CRUD)</option>
                  <option value="stomp">STOMP (Spring)</option>
                  <option value="socketio">Socket.IO (Node)</option>
                </select>
                {tech === 'stomp' && author && name && (
                  <span style={{ fontSize: 12, color: stompColor, fontWeight: 'bold' }}>
                    ● {stompStatus}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <input
                  value={authorInput}
                  onChange={e => setAuthorInput(e.target.value)}
                  placeholder="Autor"
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', flex: 1 }}
                />
                <button
                  onClick={() => loadBlueprints(authorInput)}
                  style={{ padding: '6px 12px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
                >
                  Cargar
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Nombre del nuevo plano"
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', flex: 1 }}
                />
                <button
                  onClick={createBlueprint}
                  style={{ padding: '6px 12px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
                >
                  Crear
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>
                 {error}
                <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>✕</button>
              </div>
            )}

            {blueprints.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #e2e8f0', fontSize: 13 }}>Nombre</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #e2e8f0', fontSize: 13 }}>Puntos</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #e2e8f0', fontSize: 13 }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {blueprints.map(bp => (
                    <tr key={bp.name} style={{ background: selectedBp?.name === bp.name ? '#eff6ff' : '#fff' }}>
                      <td style={{ padding: '8px 10px', border: '1px solid #e2e8f0', fontSize: 13 }}>{bp.name}</td>
                      <td style={{ padding: '8px 10px', border: '1px solid #e2e8f0', fontSize: 13 }}>{bp.points?.length ?? 0}</td>
                      <td style={{ padding: '8px 10px', border: '1px solid #e2e8f0' }}>
                        <button
                          onClick={() => selectBlueprint(bp)}
                          style={{ padding: '3px 8px', borderRadius: 4, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}
                        >
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc' }}>
                    <td style={{ padding: '8px 10px', border: '1px solid #e2e8f0', fontWeight: 'bold', fontSize: 13 }}>Total</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #e2e8f0', fontWeight: 'bold', fontSize: 13 }}>{totalPoints}</td>
                    <td style={{ border: '1px solid #e2e8f0' }}></td>
                  </tr>
                </tfoot>
              </table>
            )}

          </div>

          {/* Columna derecha — canvas */}
          {selectedBp && (
            <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <p style={{ fontWeight: 'bold', marginBottom: 8 }}>Plano: {author} / {name}</p>
              <canvas
                ref={canvasRef}
                width={600}
                height={400}
                style={{ border: '1px solid #ddd', borderRadius: 12, cursor: 'crosshair', display: 'block', width: '100%' }}
                onClick={onCanvasClick}
              />
              <p style={{ opacity: .5, marginTop: 6, fontSize: 12 }}>
                  Haz clic en el canvas para dibujar. Abre 2 pestañas con el mismo plano para ver la colaboración en vivo.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', width: '100%' }}>
                <button
                  onClick={saveBlueprint}
                  style={{ padding: '6px 16px', borderRadius: 6, background: '#d97706', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  Guardar
                </button>
                <button
                  onClick={deleteBlueprint}
                  style={{ padding: '6px 16px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  Eliminar
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    )
}