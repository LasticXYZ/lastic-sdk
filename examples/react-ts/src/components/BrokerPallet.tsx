import { CheckIfBrokerExists, useInkathon } from '@poppyseed/lastic-sdk'
import { useEffect, useState } from 'react'
import BrokerConstants from './BrokerConstants'
import BrokerRegionData from './BrokerRegionData'
import BrokerSaleInfo from './BrokerSaleInfo'
import PurchaseInteractor from './PurchaseInteractor'

export default function BrokerPallet() {
  const { api, isConnected } = useInkathon()
  const [brokerExists, setBrokerExists] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBrokerStatus() {
      try {
        //if (!api) throw new Error("API not initialized");
        const exists = await CheckIfBrokerExists(api)
        setBrokerExists(exists)
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('An unknown error occurred')
          // Optionally, log the unknown error for debugging purposes
          console.error('An unknown error occurred:', err)
        }
      }
    }

    fetchBrokerStatus()
  }, [api])

  if (error) {
    return <div>Error: {error}</div>
  }

  if (brokerExists === null) {
    return <div>Loading...</div>
  }

  if (!isConnected) {
    return <div>Not connected</div>
  }

  // Handling case when broker does not exist
  if (!brokerExists) {
    return <div>Broker Pallet does not exist</div>
  } else
    return (
      <div>
        <h3>Broker Constants:</h3>
        <BrokerConstants />

        <h3>Broker Extrinsics:</h3>
        <PurchaseInteractor />

        <BrokerSaleInfo />

        <h3>Broker Events:</h3>
        <BrokerRegionData />
      </div>
    )
}
