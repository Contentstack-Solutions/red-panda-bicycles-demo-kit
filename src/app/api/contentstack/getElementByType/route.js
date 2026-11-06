import ContentstackServer from "@/lib/cstack";

export async function POST(request) {
    try {
        const variantParam = request.headers.get('x-personalize-variants');
        const { type, locale, live_preview } = await request.json();
        const res = await ContentstackServer.getElementByType(type, locale, live_preview, variantParam);
        return Response.json(res || {});
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch data" }, { status: 500 });
    }
}