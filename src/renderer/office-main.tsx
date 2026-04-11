import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { OfficeApp } from './office/OfficeApp'
import './office/styles/office.css'
import './styles/tokens.css'

const container = document.getElementById('office-root') ?? document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <OfficeApp />
    </StrictMode>,
  )
}
