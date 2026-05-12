export function installFileDropHandler(): void {
  document.addEventListener('dragover', (event) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  })
}
