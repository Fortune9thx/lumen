import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WalletProvider } from './lib/WalletContext.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { Landing } from './pages/Landing.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { CreatePolicyFlight } from './pages/CreatePolicyFlight.jsx'
import { CreatePolicyWeather } from './pages/CreatePolicyWeather.jsx'
import { PolicyDetail } from './pages/PolicyDetail.jsx'
import { SubmitClaim } from './pages/SubmitClaim.jsx'
import { ClaimStatus } from './pages/ClaimStatus.jsx'
import { Wallet } from './pages/Wallet.jsx'

export default function App() {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/policies/new/flight" element={<CreatePolicyFlight />} />
            <Route path="/policies/new/weather" element={<CreatePolicyWeather />} />
            <Route path="/policies/:id" element={<PolicyDetail />} />
            <Route path="/claims/new" element={<SubmitClaim />} />
            <Route path="/claims/:id" element={<ClaimStatus />} />
            <Route path="/wallet" element={<Wallet />} />
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </ErrorBoundary>
  )
}
