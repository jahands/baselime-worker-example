import { BaselimeLogger } from '@baselime/edge-logger'
import { instrument, ResolveConfigFn } from '@microlabs/otel-cf-workers'
import { trace } from '@opentelemetry/api'

export interface Env {
	BASELIME_KEY: string
}

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: 'https://otel.baselime.io/v1/',
			headers: { 'x-api-key': env.BASELIME_KEY },
		},
		service: { name: 'my-worker', namespace: 'otel' }
	}
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const logger = new BaselimeLogger({
			ctx,
			apiKey: env.BASELIME_KEY,
			service: 'my-worker',
			dataset: 'cloudflare',
			namespace: 'fetch',
			requestId: request.headers.get('cf-ray'),
		})

		const tracer = trace.getTracer('default')
		await tracer.startActiveSpan('my-span', async (span) => {
			span.setAttribute('foo', 'bar')
			span.addEvent('my-event', { foo: 'bar' })
			const res = await fetch('https://uuid.rocks/plain')
			span.addEvent('fetch', { status: res.status })
			const body = await res.text()
			span.setAttribute('body', body)
			logger.info('Hello world', { cfRay: request.headers.get('cf-ray'), foo: 'bar', body })
			span.end()
		})

		ctx.waitUntil(logger.flush())
		return new Response('Hello world!')
	},
}

export default instrument(handler, config)
