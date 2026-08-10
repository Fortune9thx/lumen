import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { connectWallet, getWalletChainId, switchToTargetChain, getActiveProvider, TARGET_CHAIN_ID, TARGET_CHAIN } from './genlayer.js'

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [switchingChain, setSwitchingChain] = useState(false)

  const wrongChain = address !== null && chainId !== null && chainId !== TARGET_CHAIN_ID

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const addr = await connectWallet()
      setAddress(addr)
      setChainId(await getWalletChainId())
      return addr
    } catch (err) {
      setError(err.message || 'Failed to connect wallet')
      throw err
    } finally {
      setConnecting(false)
    }
  }, [])

  const switchChain = useCallback(async () => {
    setSwitchingChain(true)
    setError(null)
    try {
      await switchToTargetChain()
      setChainId(await getWalletChainId())
    } catch (err) {
      setError(err.message || 'Failed to switch network')
      throw err
    } finally {
      setSwitchingChain(false)
    }
  }, [])

  useEffect(() => {
    // Binds to whichever provider connectWallet() actually discovered and
    // used (EIP-6963 or a legacy vendor global) — not necessarily
    // window.ethereum, which some wallets (OKX included) don't set unless
    // they're the browser's default wallet.
    const provider = getActiveProvider()
    if (!provider) return
    const handleChainChanged = (hex) => setChainId(parseInt(hex, 16))
    provider.on?.('chainChanged', handleChainChanged)
    return () => provider.removeListener?.('chainChanged', handleChainChanged)
  }, [address])

  return (
    <WalletContext.Provider
      value={{ address, connecting, error, connect, chainId, wrongChain, targetChainName: TARGET_CHAIN.name, switchChain, switchingChain }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
