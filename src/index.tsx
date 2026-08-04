import Loading from './components/Loading'
import './index.css'
import TypingPage from './pages/Typing'
import { isOpenDarkModeAtom } from '@/store'
import { useAtomValue } from 'jotai'
import mixpanel from 'mixpanel-browser'
import React, { Suspense, lazy, useEffect } from 'react'
import 'react-app-polyfill/stable'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

const AnalysisPage = lazy(() => import('./pages/Analysis'))
const GalleryPage = lazy(() => import('./pages/Gallery-N'))

const mixpanelToken = import.meta.env.DEV ? import.meta.env.VITE_MIXPANEL_KEY_DEV : import.meta.env.VITE_MIXPANEL_KEY
if (mixpanelToken) {
  mixpanel.init(mixpanelToken, import.meta.env.DEV ? { debug: true } : undefined)
}

const container = document.getElementById('root')

function Root() {
  const darkMode = useAtomValue(isOpenDarkModeAtom)
  useEffect(() => {
    darkMode ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark')
  }, [darkMode])

  return (
    <React.StrictMode>
      <HashRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route index element={<TypingPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </HashRouter>
      <ToastContainer
        position="bottom-right"
        autoClose={2500}
        hideProgressBar
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable={false}
        pauseOnHover
      />
    </React.StrictMode>
  )
}

container && createRoot(container).render(<Root />)
