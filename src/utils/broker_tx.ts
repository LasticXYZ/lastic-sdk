import { Toast } from '@/types'
import { checkCall } from '@/utils/check'
import { ApiPromise, SubmittableResult } from '@polkadot/api'
import { InjectedAccount, InjectedExtension } from '@polkadot/extension-inject/types'
import { Dispatch, SetStateAction } from 'react'
import { transformParams } from './broker'
import { txErrHandler, txResHandler } from './broker_handler'

export interface CurrentAccount {
  address: string
  meta: {
    source: string
    isInjected: boolean
  }
}

interface TransactionParams {
  palletRpc: string
  callable: string
  inputParams: any[]
  paramFields: any[]
}

const signedTx = async (
  api: ApiPromise,
  { palletRpc, callable, inputParams, paramFields }: TransactionParams,
  setStatus: Dispatch<SetStateAction<string | null>>,
  addToast: (toast: Omit<Toast, 'id'>) => void,
  setUnsub: Dispatch<SetStateAction<any>>,
  activeAccount: InjectedAccount,
  activeExtension: InjectedExtension
) => {
  const address = activeAccount?.address
  const transformed = transformParams(paramFields, inputParams)

  let txExecute = transformed
    ? api.tx[palletRpc][callable](...transformed)
    : api.tx[palletRpc][callable]()

  const isMimir = activeExtension.name === 'mimir'

  if (isMimir) {
    const result: any = await activeExtension.signer.signPayload?.({
      address,
      genesisHash: api.genesisHash.toHex(),
      method: txExecute.method.toHex()
    } as unknown as any)

    const method = api.registry.createType('Call', result.payload.method)

    if (!checkCall(api, method, txExecute.method)) {
      throw new Error('not safe tx')
    }

    txExecute = api.tx[method.section][method.method](...method.args)

    txExecute.addSignature(result.signer, result.signature, result.payload)
  } else {
    await txExecute.signAsync(address, { signer: activeExtension.signer })
  }

  const unsub = await txExecute
    .send((result: SubmittableResult) =>
      txResHandler(setStatus, api, addToast, result),
    )
    .catch((err: Error) => txErrHandler(setStatus, addToast, err))

  setUnsub(() => unsub)
}

const unsignedTx = async (
  api: ApiPromise,
  { palletRpc, callable, inputParams, paramFields }: TransactionParams,
  setStatus: Dispatch<SetStateAction<string | null>>,
  addToast: (toast: Omit<Toast, 'id'>) => void,
  setUnsub: Dispatch<SetStateAction<any>>, // Replace 'any' with a specific type if possible
) => {
  const transformed = transformParams(paramFields, inputParams)

  const txExecute = transformed
    ? api.tx[palletRpc][callable](...transformed)
    : api.tx[palletRpc][callable]()

  const unsub = await txExecute
    .send((result: SubmittableResult) => txResHandler(setStatus, api, addToast, result))
    .catch((err: Error) => txErrHandler(setStatus, addToast, err))

  setUnsub(() => unsub)
}

export { signedTx, unsignedTx }
