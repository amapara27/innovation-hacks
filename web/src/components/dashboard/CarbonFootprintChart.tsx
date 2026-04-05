import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface DataPoint {
  month: string;
  co2: number;
  offset: number;
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Carbon Footprint vs. Offset</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
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
                dataKey="co2"
                stroke="#c65d2b"
                strokeWidth={2.5}
                fill="url(#co2Gradient)"
                name="CO₂ Emitted (kg)"
              />
              <Area
                type="monotone"
                dataKey="offset"
                stroke="#6b9b6b"
                strokeWidth={2.5}
                fill="url(#offsetGradient)"
                name="CO₂ Offset (kg)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
