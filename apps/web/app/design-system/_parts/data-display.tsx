"use client";

import { AspectRatio } from "@mandhira/ui/components/ui/aspect-ratio";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@mandhira/ui/components/ui/avatar";
import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@mandhira/ui/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@mandhira/ui/components/ui/chart";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@mandhira/ui/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@mandhira/ui/components/ui/item";
import { Progress, ProgressIndicator, ProgressTrack } from "@mandhira/ui/components/ui/progress";
import { ScrollArea } from "@mandhira/ui/components/ui/scroll-area";
import { Separator } from "@mandhira/ui/components/ui/separator";
import { Skeleton } from "@mandhira/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import { MapPinIcon, MountainIcon, SearchIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Section, Specimen } from "./shell";

const ROWS = [
  { place: "Kashi Vishwanath", tier: "Protected", trust: "Verified", freshness: "Fresh" },
  { place: "Sarnath", tier: "Important", trust: "Human reviewed", freshness: "Aging" },
  { place: "Ram Janmabhoomi", tier: "Fixed", trust: "Verified", freshness: "Fresh" },
  { place: "Hanuman Garhi", tier: "Optional", trust: "Unverified", freshness: "Stale" },
];

const CHART_DATA = [
  { day: "Day 1", planned: 5, actual: 4 },
  { day: "Day 2", planned: 6, actual: 6 },
  { day: "Day 3", planned: 4, actual: 5 },
  { day: "Day 4", planned: 7, actual: 6 },
  { day: "Day 5", planned: 3, actual: 3 },
];

const CHART_CONFIG = {
  planned: { label: "Planned", color: "var(--chart-1)" },
  actual: { label: "Actual", color: "var(--chart-3)" },
};

export function DataDisplay() {
  return (
    <Section
      id="data"
      title="Data display"
      summary="Card, Table, Item, Avatar, Progress, Chart, Skeleton, Empty, Separator, ScrollArea and AspectRatio."
    >
      <Specimen name="Card" className="block">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Kashi and Ayodhya</CardTitle>
              <CardDescription>5 days · 2 travellers · December</CardDescription>
              <CardAction>
                <Badge>Tight</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Two darshan windows sit close together on Day 3, because the temple closes at noon.
              </p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">Review</Button>
              <Button size="sm" variant="ghost">
                Keep as is
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Journey health</CardTitle>
              <CardDescription>Five checks, run on every change</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={72} aria-label="Journey health checks">
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
              <p className="text-sm text-muted-foreground">4 of 5 checks comfortable.</p>
            </CardContent>
          </Card>
        </div>
      </Specimen>

      <Specimen name="Table" className="block">
        <Table>
          <TableCaption>Places on this journey, with their trust record.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Place</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>Freshness</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((r) => (
              <TableRow key={r.place}>
                <TableCell className="font-medium">{r.place}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.tier}</Badge>
                </TableCell>
                <TableCell>{r.trust}</TableCell>
                <TableCell>{r.freshness}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Specimen>

      <Specimen name="Item" className="block">
        <ItemGroup className="rounded-md border border-border">
          <Item>
            <ItemMedia variant="icon">
              <MountainIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Kedarnath</ItemTitle>
              <ItemDescription>Opens May to November · 3,583 m</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button size="sm" variant="outline">
                Add
              </Button>
            </ItemActions>
          </Item>
          <ItemSeparator />
          <Item variant="muted">
            <ItemMedia variant="icon">
              <MapPinIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Gaurikund</ItemTitle>
              <ItemDescription>Trailhead · the road ends here</ItemDescription>
            </ItemContent>
          </Item>
        </ItemGroup>
      </Specimen>

      <Specimen name="Avatar">
        <Avatar>
          <AvatarFallback>PG</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>MR</AvatarFallback>
          <AvatarBadge className="bg-primary" />
        </Avatar>
        <AvatarGroup>
          <Avatar>
            <AvatarFallback>A</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>B</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>C</AvatarFallback>
          </Avatar>
          <AvatarGroupCount>+4</AvatarGroupCount>
        </AvatarGroup>
      </Specimen>

      <Specimen name="Chart" className="block">
        <ChartContainer config={CHART_CONFIG} className="h-56 w-full">
          <BarChart data={CHART_DATA}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="planned" fill="var(--color-planned)" radius={4} />
            <Bar dataKey="actual" fill="var(--color-actual)" radius={4} />
          </BarChart>
        </ChartContainer>
      </Specimen>

      <Specimen name="Skeleton and Empty" className="block">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border border-border p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Empty className="rounded-md border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>Nothing here yet</EmptyTitle>
              <EmptyDescription>
                Nothing published matches this search, because the sources for it are still in
                review.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" variant="outline">
                Clear filters
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </Specimen>

      <Specimen name="Separator, ScrollArea and AspectRatio" className="block">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm">Above</p>
            <Separator className="my-3" />
            <p className="text-sm">Below</p>
            <div className="mt-3 flex h-6 items-center gap-3">
              <span className="text-sm">A</span>
              <Separator orientation="vertical" />
              <span className="text-sm">B</span>
            </div>
          </div>
          <ScrollArea className="h-36 rounded-md border border-border p-3">
            <div className="space-y-2">
              {Array.from({ length: 12 }, (_, i) => (
                <p key={i} className="text-sm">
                  Scrollable row {i + 1}
                </p>
              ))}
            </div>
          </ScrollArea>
        </div>
        <AspectRatio
          ratio={16 / 9}
          className="mt-4 flex items-center justify-center rounded-md bg-muted text-sm text-muted-foreground"
        >
          AspectRatio 16 : 9
        </AspectRatio>
      </Specimen>
    </Section>
  );
}
