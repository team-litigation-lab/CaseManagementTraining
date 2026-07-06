export async function onRequest(context) {
  return new Response(JSON.stringify({ 
    message: "Hello from Cloudflare serverless code!" 
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
