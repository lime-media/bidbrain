import DashboardCards from "@/components/DashboardCards";

export default function Home() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">
        <span className="text-[#4B1F93]">Bid</span>
        <span className="text-[#94CE3C]">Brain</span> Dashboard
      </h1>
      <p className="text-gray-500 mb-8">
        Procurement intelligence for Lime Media
      </p>
      <DashboardCards />
    </main>
  );
}
