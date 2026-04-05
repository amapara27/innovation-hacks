import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface DataPoint {
  month: string;
  co2: number;
  offset: number;
  gap?: number;
}

interface CarbonFootprintChartProps {
  data?: DataPoint[];
}

const defaultData: DataPoint[] = [
  { month: "Jan", co2: 320, offset: 80 },
  { month: "Feb", co2: 290, offset: 120 },
  { month: "Mar", co2: 340, offset: 150 },
  { month: "Apr", co2: 280, offset: 200 },
  { month: "May", co2: 250, offset: 220 },
  { month: "Jun", co2: 210, offset: 260 },
];

export default function CarbonFootprintChart({
  data = defaultData,
}: CarbonFootprintChartProps) {
  // Calculate gap for each month
  const dataWithGap = data.map(d => ({
    ...d,
    gap: Math.max(0, d.co2 - d.offset),
  }));

  // Calculate current month's gap
  const latestData = dataWithGap[dataWithGap.length - 1];
  const currentGap = latestData.co2 - latestData.offset;
  const isNeutral = currentGap <= 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>Carbon Footprint vs. Offset</CardTitle>

          {/* Gap to Neutral Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
            isNeutral
              ? "bg-forest-600/20 border border-forest-600/30"
              : "bg-clay-600/20 border border-clay-600/30"
          }`}>
            {isNeutral ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-forest-400" strokeWidth={2.5} />
                <span className="text-xs font-medium text-forest-400">Carbon Neutral</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-clay-400" strokeWidth={2.5} />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-clay-400">Gap to Neutral</span>
                  <span className="text-xs font-bold text-clay-300">{Math.abs(currentGap)} kg</span>
                </div>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dataWithGap}>
              <defs>
                <linearGradient id="co2Gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c65d2b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#c65d2b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="offsetGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6b9b6b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6b9b6b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="#292524" strokeOpacity={0.3} />
              <XAxis
                dataKey="month"
                stroke="#78716c"
                fontSize={12}
                fontFamily="Plus Jakarta Sans"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#78716c"
                fontSize={12}
                fontFamily="Plus Jakarta Sans"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => `${value}kg`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1c1917",
                  border: "1px solid #44403c",
                  borderRadius: "0.5rem",
                  color: "#f5f5f4",
                  fontSize: "0.875rem",
                  fontFamily: "Plus Jakarta Sans",
                  padding: "12px",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                }}
              />

              <Area
                type="monotone"
                dataKey="offset"
                stroke="#6b9b6b"
                strokeWidth={2.5}
                fill="url(#offsetGradient)"
                name="CO₂ Offset (kg)"
              />

              <Area
                type="monotone"
                dataKey="co2"
                stroke="#c65d2b"
                strokeWidth={2.5}
                fill="url(#co2Gradient)"
                name="CO₂ Emitted (kg)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Action Nudge */}
        {!isNeutral && (
          <div className="mt-4 p-3 rounded-lg bg-clay-600/10 border border-clay-600/20 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-clay-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-clay-300 font-medium">
                You're <span className="font-bold">{Math.abs(currentGap)} kg</span> away from carbon neutrality.
              </p>
              <p className="text-xs text-stone-500 mt-1">
                Stake more or swap to green assets to close the gap.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
