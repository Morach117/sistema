const BOX_MARKER = 'CAJA:'
const PIECE_MARKER = '➔ PIEZA:'

function CaptureLabel({ children, tone }) {
  const color = tone === 'box'
    ? 'bg-indigo-500/20 text-indigo-400'
    : 'bg-emerald-500/20 text-emerald-400'

  return (
    <span className={`${color} mr-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase`}>
      {children}
    </span>
  )
}

export default function CaptureDetails({ name }) {
  const text = String(name ?? '')
  const boxStart = text.indexOf(BOX_MARKER)
  const pieceStart = text.indexOf(PIECE_MARKER)

  if (boxStart === -1 && pieceStart === -1) return text

  const beforeBox = boxStart > 0 ? text.slice(0, boxStart) : ''
  const boxTextStart = boxStart === -1 ? 0 : boxStart + BOX_MARKER.length
  const boxTextEnd = pieceStart === -1 ? text.length : pieceStart
  const boxText = text.slice(boxTextStart, boxTextEnd).trim()
  const pieceText = pieceStart === -1 ? '' : text.slice(pieceStart + PIECE_MARKER.length).trim()

  return (
    <div>
      {beforeBox}
      {boxStart !== -1 && <CaptureLabel tone="box">CAJA</CaptureLabel>}
      {boxText}
      {pieceStart !== -1 && (
        <>
          <br />
          <CaptureLabel tone="piece">CONTIENE</CaptureLabel>
          {pieceText}
        </>
      )}
    </div>
  )
}
