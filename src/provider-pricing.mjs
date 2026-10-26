import {customerRates} from '../public/pricing.js';
// Optional private billing policy is supplied by the hosting environment.
function number(name){const value=process.env[name];if(!value)throw new Error('Configurazione di fatturazione mancante');const n=Number(value);if(!Number.isFinite(n)||n<=0)throw new RangeError('Configurazione di fatturazione non valida');return n;}
export function customerCallRate(){
 if(!process.env.PRIME_CALL_PROVIDER_USD_PER_MINUTE)return customerRates.minutes;
 const voice=number('PRIME_CALL_PROVIDER_USD_PER_MINUTE')*number('PRIME_CALL_MARGIN');
 const llm=number('PRIME_LLM_PROVIDER_USD_PER_MINUTE')*number('PRIME_LLM_MARGIN');
 const fx=number('PRIME_USD_PER_EUR');
 return Math.round((Math.round(voice/fx*1e5)+Math.round(llm/fx*1e5)))/1e5;
}
