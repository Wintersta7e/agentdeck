import { contextBridge } from 'electron'
import { createAgentDeckBridge } from './bridge'
import { installFileDropHandler } from './file-drop'

installFileDropHandler()

contextBridge.exposeInMainWorld('agentDeck', createAgentDeckBridge())
