import { useBalance, useInkathon, useRelayBalance } from '@poppyseed/lastic-sdk'
import { useEffect, useState } from 'react'
import { TransferDialog } from './TransferDialog'

export function ConnectionStatus() {
  const {
    api,
    error,
    relayApi,
    isConnected,
    activeChain,
    activeRelayChain,
    activeAccount,
    disconnect,
  } = useInkathon()

  // Fetch & watch balance
  const { balanceFormatted } = useBalance(activeAccount?.address, true)
  const { balanceFormatted: relayBalanceFormatted } = useRelayBalance(activeAccount?.address, true)

  // Check whether the connected chain has pallet-contracts
  const [hasPalletContracts, setHasPalletContracts] = useState<boolean | undefined>(undefined)
  const [relayHasPalletContracts, setRelayHasPalletContracts] = useState<boolean | undefined>(
    undefined,
  )
  useEffect(() => {
    const getPalletVersion = api?.query?.contracts?.palletVersion
    setHasPalletContracts(!!getPalletVersion)
  }, [api])

  useEffect(() => {
    const getRelayPalletVersion = relayApi?.query?.contracts?.palletVersion
    setRelayHasPalletContracts(!!getRelayPalletVersion)
  }, [relayApi])

  return (
    <article>
      <h2 style={{ marginBottom: '1.5rem' }}>Status</h2>

      <p>
        {isConnected ? (
          <code style={{ color: 'rgba(56, 142, 60, 1)', background: 'rgba(56, 142, 60, .1)' }}>
            Connected
          </code>
        ) : error?.message ? (
          <code style={{ color: 'rgba(198, 40, 40, 1)', background: 'rgba(198, 40, 40, .1)' }}>
            {error.message}
          </code>
        ) : (
          <code>Disconnected</code>
        )}
      </p>

      {isConnected && (
        <>
          {/* Chain */}
          <strong>Network</strong>
          <small>
            <p>
              {activeChain?.name}{' '}
              {!hasPalletContracts && (
                <span style={{ color: 'rgba(198, 40, 40, 1)' }}>(pallet-contracts not found)</span>
              )}
            </p>
            <strong>Relay Network</strong>
            <p>
              {activeRelayChain?.name}{' '}
              {!relayHasPalletContracts && (
                <span style={{ color: 'rgba(198, 40, 40, 1)' }}>(pallet-contracts not found)</span>
              )}
            </p>
          </small>

          {/* Wallet Address */}
          <strong>Account</strong>
          <small>
            <p>{activeAccount?.address}</p>
          </small>

          {/* Balance */}
          <strong>Balance</strong>
          <small>
            <p>{balanceFormatted}</p>
          </small>

          {/* Relay Balance */}
          <strong>Relay Balance</strong>
          <small>
            <p>{relayBalanceFormatted}</p>
          </small>

          <div className="grid">
            {/* Transfer dialog */}
            <TransferDialog />

            {/* Disconnect button */}
            <button className="secondary" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        </>
      )}
    </article>
  )
}
