import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { Buffer } from 'buffer'

window.Buffer = Buffer

const Router = import.meta.env.PROD ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')).render(
  <Router>
    <App />
  </Router>,
)
