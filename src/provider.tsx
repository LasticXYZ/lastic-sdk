import Snackbar from '@/Toasts/Snackbar'
import { accountArraysAreEqual, accountsAreEqual, initPolkadotJs } from '@/helpers'
import { registerDeployments } from '@/registry'
import {
  SubstrateChain,
  SubstrateDeployment,
  SubstrateWallet,
  Toast,
  UseInkathonError,
  UseInkathonErrorCode,
  UseInkathonProviderContextType
} from '@/types'
import {
  allSubstrateWallets,
  enableWallet,
  getSubstrateWallet,
  isWalletInstalled
} from '@/wallets'
import { inject, isMimirReady, MIMIR_REGEXP } from '@mimirdev/apps-inject'
import { ApiPromise, HttpProvider, WsProvider } from '@polkadot/api'
import { ApiOptions } from '@polkadot/api/types'
import { InjectedAccount, InjectedExtension, Unsubcall } from '@polkadot/extension-inject/types'
import { Signer } from '@polkadot/types/types'
import {
  createContext,
  FC,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { getSubstrateChain } from './chains'

const MAX_VISIBLE_TOASTS = 6

const UseInkathonProviderContext = createContext<UseInkathonProviderContextType | null>(null)

/**
 * Primary useInkathon hook that exposes `UseInkathonProviderContext`.
 */
export const useInkathon = () => {
  const context = useContext(UseInkathonProviderContext)
  if (!context) throw new Error('useInkathon must be used within a UseInkathonProvider')
  return context
}

/**
 * Main provider that needs to be wrapped around the app (see README)
 * to use `useInkathon` and other hooks anywhere.
 */
export interface UseInkathonProviderProps extends PropsWithChildren {
  appName: string
  defaultChain: SubstrateChain | SubstrateChain['network']
  relayChain: SubstrateChain | SubstrateChain['network']
  connectOnInit?: boolean
  deployments?: Promise<SubstrateDeployment[]>
  apiOptions?: ApiOptions
}
export const UseInkathonProvider: FC<UseInkathonProviderProps> = ({
  children,
  appName,
  defaultChain,
  relayChain,
  connectOnInit,
  deployments: _deployments,
  apiOptions,
}) => {
  // Check if default chain was provided
  if (
    !defaultChain ||
    !relayChain ||
    (typeof defaultChain === 'string' &&
      typeof relayChain === 'string' &&
      getSubstrateChain(defaultChain) === undefined)
  ) {
    throw new Error(
      'None or invalid `defaultChain` or invalid `relayChain` provided with `UseInkathonProvider`. Forgot to set environment variable?',
    )
  }

  // Setup state variables
  const isInitializing = useRef(false)
  const isInitialized = useRef(false)
  const [isConnecting, setIsConnecting] = useState(connectOnInit)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<UseInkathonError | undefined>()
  const [activeChain, setActiveChain] = useState<SubstrateChain>(
    (typeof defaultChain === 'string'
      ? getSubstrateChain(defaultChain)
      : defaultChain) as SubstrateChain,
  )
  const [activeRelayChain, setActiveRelayChain] = useState<SubstrateChain>(
    (typeof relayChain === 'string' ? getSubstrateChain(relayChain) : relayChain) as SubstrateChain,
  )
  const [api, setApi] = useState<ApiPromise>()
  const [relayApi, setRelayApi] = useState<ApiPromise>()
  const [provider, setProvider] = useState<WsProvider | HttpProvider>()
  const [relayProvider, setRelayProvider] = useState<WsProvider | HttpProvider>()
  const [accounts, setAccounts] = useState<InjectedAccount[]>([])
  const [activeAccount, setActiveAccount] = useState<InjectedAccount>()
  const [lastActiveAccount, setLastActiveAccount] = useState<InjectedAccount>()
  const activeExtension = useRef<InjectedExtension>()
  const activeSigner = useRef<Signer>()
  const unsubscribeAccounts = useRef<Unsubcall>()
  const [deployments, setDeployments] = useState<SubstrateDeployment[]>([])

  const [toasts, setToasts] = useState<Toast[]>([])

  // Register given deployments
  useEffect(() => {
    if (_deployments) registerDeployments(setDeployments, _deployments)
  }, [])

  // Initialize polkadot-js/api
  const initialize = async (chain?: SubstrateChain, relayChain?: SubstrateChain) => {
    isInitializing.current = true
    setIsConnected(false)
    setError(undefined)

    const _chain = chain || activeChain
    const _relayChain = relayChain || activeRelayChain
    let _api: ApiPromise | undefined
    let _relayApi: ApiPromise | undefined
    let _provider: WsProvider | HttpProvider | undefined
    let _relayProvider: WsProvider | HttpProvider | undefined

    try {
      ;({ api: _api, provider: _provider } = await initPolkadotJs(_chain, {
        noInitWarn: true,
        throwOnConnect: true,
        ...apiOptions,
      }))
      ;({ api: _relayApi, provider: _relayProvider } = await initPolkadotJs(_relayChain, {
        noInitWarn: true,
        throwOnConnect: true,
        ...apiOptions,
      }))

      api?.disconnect()
      setApi(_api)
      relayApi?.disconnect()
      setRelayApi(_relayApi)
      provider?.disconnect()
      setProvider(_provider)
      relayProvider?.disconnect()
      setRelayProvider(_relayProvider)
      isInitialized.current = true

      // Update active chain if switching
      if (activeChain.network !== _chain.network) setActiveChain(_chain)
      if (activeRelayChain.network !== _chain.network) setActiveRelayChain(_relayChain)
    } catch (e) {
      const message = 'Error while initializing Polkadot.js API'
      console.error(message, e)
      setError({ code: UseInkathonErrorCode.InitializationError, message })
      setIsConnected(false)
      setIsConnecting(false)
      setApi(undefined)
      setRelayApi(undefined)
      setProvider(undefined)
      isInitialized.current = false
    }

    isInitializing.current = false
    return { _api, _relayApi }
  }

  // Updates account list and active account
  const updateAccounts = (
    injectedAccounts: InjectedAccount[],
    lastActiveAccountAddress?: string,
  ) => {
    const newAccounts = injectedAccounts || []
    // Find active account in new accounts or fallback to latest account
    const _lastAccount = lastActiveAccountAddress
      ? { address: lastActiveAccountAddress }
      : lastActiveAccount
    const newAccount =
      newAccounts.find((a) => accountsAreEqual(a, _lastAccount)) || newAccounts?.[0]

    // Update accounts and active account
    if (!accountArraysAreEqual(accounts, newAccounts)) {
      setAccounts(() => newAccounts)
    }
    if (!accountsAreEqual(activeAccount, newAccount)) {
      setActiveAccount(() => newAccount)
    }
    setIsConnected(!!newAccount)
  }
  useEffect(() => {
    if (activeAccount && !accountsAreEqual(activeAccount, lastActiveAccount)) {
      setLastActiveAccount(() => activeAccount)
    }
  }, [activeAccount])

  // Connect to injected wallet
  const connect = async (
    chain?: SubstrateChain,
    relayChain?: SubstrateChain,
    wallet?: SubstrateWallet,
    lastActiveAccountAddress?: string,
  ) => {
    setError(undefined)
    setIsConnecting(true)
    setIsConnected(!!activeAccount)

    // Make sure api is initialized & connected to provider
    if (
      !api?.isConnected ||
      !relayApi?.isConnected ||
      (chain && chain.network !== activeChain.network) ||
      (relayChain && relayChain.network !== activeRelayChain.network)
    ) {
      const { _api, _relayApi } = await initialize(chain, relayChain)
      if (!_api?.isConnected || !_relayApi?.isConnected) return
    }

    // special, apps will working in iframe with mimir wallet
    // so, check if the environment in ifram
    const origin = await isMimirReady();
    if (origin && MIMIR_REGEXP.test(origin)) {
      // inject window.injectedWeb3.mimir
      inject()
    }

    try {
      // Determine installed wallets
      const wallets = allSubstrateWallets.filter((w) => isWalletInstalled(w))
      if (!wallets?.length) {
        const message = 'No Substrate-compatible extension detected'
        setError({
          code: UseInkathonErrorCode.NoSubstrateExtensionDetected,
          message,
        })
        throw new Error(message)
      }

      // Determine wallet to use
      const preferredWallet = wallet && wallets.find((w) => w.id === wallet.id)
      const _wallet = preferredWallet || wallets[0]

      // Enable wallet
      const extension = await enableWallet(_wallet, appName)
      activeExtension.current = extension
      activeSigner.current = extension?.signer as Signer

      // Query & keep listening to injected accounts
      unsubscribeAccounts.current?.()
      const unsubscribe = extension?.accounts.subscribe((accounts) => {
        updateAccounts(accounts, lastActiveAccountAddress)
      })
      unsubscribeAccounts.current = unsubscribe
    } catch (e: any) {
      console.error('Error while connecting wallet:', e)
      activeExtension.current = undefined
      activeSigner.current = undefined
      setIsConnected(false)
    } finally {
      setIsConnecting(false)
    }
  }

  // Keep active signer up to date
  useEffect(() => {
    api?.setSigner(activeSigner.current as Signer)
  }, [api, activeSigner.current])

  // Disconnect
  const disconnect = async (disconnectApi?: boolean) => {
    if (disconnectApi) {
      await provider?.disconnect()
      await api?.disconnect()
      return
    }
    setIsConnected(false)
    updateAccounts([])
    unsubscribeAccounts.current?.()
    unsubscribeAccounts.current = undefined
    activeExtension.current = undefined
    activeSigner.current = undefined
    isInitialized.current = false
  }

  // API Disconnection listener
  useEffect(() => {
    if (!api) return
    const handler = () => {
      disconnect()
    }
    api?.on('disconnected', handler)
    relayApi?.on('disconnected', handler)
    return () => {
      api?.off('disconnected', handler)
      relayApi?.off('disconnected', handler)
    }
  }, [api, relayApi])

  // Initialze
  useEffect(() => {
    if (isInitialized.current || isInitializing.current) return
    connectOnInit ? connect() : initialize()
    return () => {
      unsubscribeAccounts.current?.()
    }
  }, [])

  // Switch active chain
  const switchActiveChain = async (chain: SubstrateChain, relayChain: SubstrateChain) => {
    const activeWallet = activeExtension.current && getSubstrateWallet(activeExtension.current.name)
    await connect(chain, relayChain, activeWallet)
  }

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Date.now()

    const rest = toasts.length < MAX_VISIBLE_TOASTS ? toasts : toasts.slice(0, -1)

    setToasts([{ ...toast, id }, ...rest])
  }

  const removeToast = (key: Toast['id']) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== key))
  }

  return (
    <UseInkathonProviderContext.Provider
      value={{
        isInitializing: isInitializing.current,
        isInitialized: isInitialized.current,
        isConnecting,
        isConnected,
        error,
        activeChain,
        activeRelayChain,
        switchActiveChain,
        api,
        relayApi,
        provider,
        relayProvider,
        connect,
        disconnect,
        accounts,
        activeAccount,
        activeExtension: activeExtension.current,
        activeSigner: activeSigner.current,
        setActiveAccount,
        lastActiveAccount,
        deployments,
        toasts, 
        setToasts, 
        addToast, 
        removeToast 
      }}
    > 
      <Snackbar />
      {children}
=    </UseInkathonProviderContext.Provider>
  )
}
