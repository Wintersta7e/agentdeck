import './Titlebar.css'

export function Titlebar({ centerText = '' }) {
  return (
    <div className="titlebar">
      <div className="titlebar-controls">
        <div className="control control-close" />
        <div className="control control-min" />
        <div className="control control-max" />
      </div>
      <div className="titlebar-logo">
        <div className="logo-mark" />
        <div className="logo-text">
          Agent<span>Deck</span>
        </div>
      </div>
      {centerText && <div className="titlebar-center">{centerText}</div>}
      <div className="titlebar-right">
        <button className="titlebar-btn">Ctrl+K Command</button>
        <button className="titlebar-btn primary">+ New Project</button>
      </div>
    </div>
  )
}
