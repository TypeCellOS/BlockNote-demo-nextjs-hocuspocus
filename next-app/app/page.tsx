import { Editor } from "@/components/DynamicEditor";

export default function Home() {
  return (
    <div className="flex h-screen">
      <main className="flex-1 p-10 overflow-auto">
        <Editor />
      </main>
      <aside className="w-64 bg-gray-800 text-white p-5 space-y-6">
        <h1 className="text-2xl font-bold">Sidebar</h1>
        <nav></nav>
      </aside>
    </div>
  );
}
