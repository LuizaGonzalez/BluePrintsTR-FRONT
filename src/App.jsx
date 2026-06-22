import { useEffect, useRef, useState } from 'react'
import { createStompClient, subscribeBlueprint } from './lib/stompClient.js'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
const STOMP_BASE = import.meta.env.VITE_STOMP_BASE ?? 'http://localhost:8080'

export default function App() {
  const [author, setAuthor] = useState('')
  const [name, setName] = useState('')
  const [blueprints, setBlueprints] = useState([])
  const [selectedBp, setSelectedBp] = useState(null)
  const [points, setPoints] = useState([])
  const [authorInput, setAuthorInput] = useState('Lu')
  const [nameInput, setNameInput] = useState('')

  const canvasRef = useRef(null)
  const stompRef = useRef(null)
  const unsubRef = useRef(null)

  function loadBlueprints(a) {
    if (!a) return
    fetch(`${API_BASE}/api/v1/blueprints/${a}`)
      .then(r => r.json())
      .then(res => setBlueprints(res.data ?? []))
      .catch(() => setBlueprints([]))
  }

  function loadBlueprint(a, n) {
    fetch(`${API_BASE}/api/v1/blueprints/${a}/${n}`)
      .then(r => r.json())
      .then(res => {
        const pts = res.data?.points ?? []
        setPoints(pts)
        drawAll(pts)
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

    if (!author || !name) return

    const client = createStompClient(STOMP_BASE)
    stompRef.current = client
    client.onConnect = () => {
      unsubRef.current = subscribeBlueprint(client, author, name, (upd) => {
        console.log('Mensaje recibido del servidor:', upd)
        setPoints(prev => {
          const newPoints = [...prev, upd.point]
          drawAll(newPoints)
          return newPoints
        })
      })
    }
    client.activate()

    return () => {
      unsubRef.current?.unsubscribe?.()
      stompRef.current?.deactivate?.()
    }
  }, [author, name])

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
    console.log('STOMP connected:', stompRef.current?.connected)
    console.log('Point:', point)
    if (stompRef.current?.connected) {
      stompRef.current.publish({
        destination: '/app/draw',
        body: JSON.stringify({ author, name, point })
      })
    }
  }

  function createBlueprint() {
    if (!authorInput || !nameInput) return alert('Completa autor y nombre')
    fetch(`${API_BASE}/api/v1/blueprints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: authorInput, name: nameInput, points: [] })
    })
      .then(() => {
        setNameInput('')
        loadBlueprints(authorInput)
      })
      .catch(() => alert('Error al crear el plano'))
  }

  function saveBlueprint() {
    if (!author || !name) return
    fetch(`${API_BASE}/api/v1/blueprints/${author}/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points })
    })
      .then(() => loadBlueprints(author))
      .catch(() => alert('Error al guardar el plano'))
  }

  function deleteBlueprint() {
    if (!author || !name) return
    if (!confirm(`¿Eliminar el plano "${name}" de ${author}?`)) return
    const authorToReload = author
    fetch(`${API_BASE}/api/v1/blueprints/${author}/${name}`, { method: 'DELETE' })
      .then(() => {
        setSelectedBp(null)
        setAuthor('')
        setName('')
        setPoints([])
        loadBlueprints(authorToReload)
      })
      .catch(() => alert('Error al eliminar el plano'))
  }

  const totalPoints = blueprints.reduce((acc, bp) => acc + (bp.points?.length ?? 0), 0)

  return (
    <div style={{ fontFamily: 'Inter, system-ui', padding: 24, maxWidth: 960 }}>
      <h2 style={{ marginBottom: 16 }}>BluePrints en Tiempo Real (STOMP)</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          value={authorInput}
          onChange={e => setAuthorInput(e.target.value)}
          placeholder="Autor"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc' }}
        />
        <button
          onClick={() => loadBlueprints(authorInput)}
          style={{ padding: '6px 14px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Cargar planos
        </button>
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          placeholder="Nombre del nuevo plano"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc' }}
        />
        <button
          onClick={createBlueprint}
          style={{ padding: '6px 14px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Crear
        </button>
      </div>

      {blueprints.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Nombre</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Puntos</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #e2e8f0' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {blueprints.map(bp => (
              <tr key={bp.name} style={{ background: selectedBp?.name === bp.name ? '#eff6ff' : '#fff' }}>
                <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0' }}>{bp.name}</td>
                <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0' }}>{bp.points?.length ?? 0}</td>
                <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0' }}>
                  <button
                    onClick={() => selectBlueprint(bp)}
                    style={{ padding: '4px 10px', borderRadius: 4, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f8fafc' }}>
              <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', fontWeight: 'bold' }}>Total</td>
              <td style={{ padding: '8px 12px', border: '1px solid #e2e8f0', fontWeight: 'bold' }}>{totalPoints}</td>
              <td style={{ border: '1px solid #e2e8f0' }}></td>
            </tr>
          </tfoot>
        </table>
      )}

      {selectedBp && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>Plano: {author} / {name}</span>
            <button
              onClick={saveBlueprint}
              style={{ padding: '6px 14px', borderRadius: 6, background: '#d97706', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Guardar
            </button>
            <button
              onClick={deleteBlueprint}
              style={{ padding: '6px 14px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Eliminar
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            style={{ border: '1px solid #ddd', borderRadius: 12, cursor: 'crosshair', display: 'block' }}
            onClick={onCanvasClick}
          />
          <p style={{ opacity: .6, marginTop: 8, fontSize: 13 }}>
            Haz clic en el canvas para dibujar. Abre 2 pestañas con el mismo plano para ver la colaboración en vivo.
          </p>
        </>
      )}
    </div>
  )
}