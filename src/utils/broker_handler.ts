import { ApiPromise } from '@polkadot/api';
import { bnFromHex } from '@polkadot/util';
import { Dispatch, SetStateAction } from 'react';

interface EventRecord {
    event: {
      data: any[];
      method: string;
      section: string;
    };
  }
  
  interface TransactionStatus {
    isFinalized: boolean;
    asFinalized: { toString(): string };
    type: string;
  }

const txResHandler = (
    setStatus: Dispatch<SetStateAction<string | null>>,
    api: ApiPromise,
    { events, status, txHash }: { events: EventRecord[]; status: TransactionStatus; txHash: string }
) =>{
    status.isFinalized
      ? setStatus(`😉 Finalized. Block hash: ${status.asFinalized.toString()}`)
      : setStatus(`Current transaction status: ${status.type}`)

      // Loop through Vec<EventRecord> to display all events
      events.forEach(({ _, event: { data, method, section } }) => {
        if ((section + ":" + method) === 'system:ExtrinsicFailed' ) {
          // extract the data for this event
          const [dispatchError, dispatchInfo] = data;
          console.log(`dispatchinfo: ${dispatchInfo}`)
          let errorInfo;
          
          // decode the error
          if (dispatchError.isModule) {
            // for module errors, we have the section indexed, lookup
            // (For specific known errors, we can also do a check against the
            // api.errors.<module>.<ErrorName>.is(dispatchError.asModule) guard)
            const mod = dispatchError.asModule
            const error = api.registry.findMetaError(
                new Uint8Array([mod.index.toNumber(), bnFromHex(mod.error.toHex().slice(0, 4)).toNumber()])
            )
            let message = `${error.section}.${error.name}${
                Array.isArray(error.docs) ? `(${error.docs.join('')})` : error.docs || ''
            }`
            
            errorInfo = `${message}`;
            console.log(`Error-info::${JSON.stringify(error)}`)
          } else {
            // Other, CannotLookup, BadOrigin, no extra info
            errorInfo = dispatchError.toString();
          }
          setStatus(`😞 Transaction Failed! ${section}.${method}::${errorInfo}`)
        } else if (section + ":" + method === 'system:ExtrinsicSuccess' ) {
          setStatus(`❤️️ Transaction successful! tx hash: ${txHash} , Block hash: ${status.asFinalized.toString()}`)
        }
      });
  }

const txErrHandler = (
    setStatus: Dispatch<SetStateAction<string | null>>,
    err: any
) => {
  setStatus(`😞 Transaction Failed: ${err.toString()}`);
};


export {
    txErrHandler, txResHandler
};
