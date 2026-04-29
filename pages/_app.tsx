import type { AppProps } from 'next/app'
import { Analytics } from '@vercel/analytics/next'
import 'leaflet/dist/leaflet.css'
import '../styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  )
}
