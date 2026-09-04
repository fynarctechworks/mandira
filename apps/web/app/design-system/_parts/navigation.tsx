"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@mandhira/ui/components/ui/accordion";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@mandhira/ui/components/ui/breadcrumb";
import { Button } from "@mandhira/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@mandhira/ui/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@mandhira/ui/components/ui/command";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@mandhira/ui/components/ui/menubar";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@mandhira/ui/components/ui/navigation-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@mandhira/ui/components/ui/pagination";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@mandhira/ui/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@mandhira/ui/components/ui/tabs";
import { CalendarIcon, MapIcon, SettingsIcon } from "lucide-react";
import { Section, Specimen } from "./shell";

export function Navigation() {
  return (
    <Section
      id="navigation"
      title="Navigation & disclosure"
      summary="Tabs, Accordion, Collapsible, Breadcrumb, Pagination, NavigationMenu, Menubar, Command and Resizable."
    >
      <Specimen name="Tabs" note="default and line variants" className="block space-y-6">
        <Tabs defaultValue="now">
          <TabsList>
            <TabsTrigger value="now">Now</TabsTrigger>
            <TabsTrigger value="next">Next</TabsTrigger>
            <TabsTrigger value="later">Later</TabsTrigger>
          </TabsList>
          <TabsContent value="now" className="pt-3 text-sm text-muted-foreground">
            Leave for Kashi Vishwanath by 4:40 am, because the queue doubles after 5.
          </TabsContent>
          <TabsContent value="next" className="pt-3 text-sm text-muted-foreground">
            Breakfast near Godowlia, then Sarnath.
          </TabsContent>
          <TabsContent value="later" className="pt-3 text-sm text-muted-foreground">
            Evening Ganga aarti at Dashashwamedh.
          </TabsContent>
        </Tabs>

        <Tabs defaultValue="sources">
          <TabsList variant="line">
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="publish">Publish</TabsTrigger>
          </TabsList>
          <TabsContent value="sources" className="pt-3 text-sm text-muted-foreground">
            12 sources, 3 awaiting verification.
          </TabsContent>
          <TabsContent value="review" className="pt-3 text-sm text-muted-foreground">
            4 change candidates in the queue.
          </TabsContent>
          <TabsContent value="publish" className="pt-3 text-sm text-muted-foreground">
            Nothing below human reviewed reaches a traveller.
          </TabsContent>
        </Tabs>
      </Specimen>

      <Specimen name="Accordion & Collapsible" className="block">
        <Accordion defaultValue={["what"]}>
          <AccordionItem value="what">
            <AccordionTrigger>What changed</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              The temple moved its afternoon closing an hour earlier.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="why">
            <AccordionTrigger>Why it matters</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              Your Day 3 darshan sits inside the window that is now closed.
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Collapsible className="mt-4">
          <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
            Show sources
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 text-sm text-muted-foreground">
            Temple trust notice, retrieved 3 days ago · T1
          </CollapsibleContent>
        </Collapsible>
      </Specimen>

      <Specimen name="Breadcrumb & Pagination" className="block space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Destinations</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Varanasi</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Kashi Vishwanath</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Specimen>

      <Specimen name="NavigationMenu & Menubar" className="block space-y-4">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Plan</NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid w-64 gap-1 p-2">
                  <NavigationMenuLink href="#">New journey</NavigationMenuLink>
                  <NavigationMenuLink href="#">Saved journeys</NavigationMenuLink>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Discover</NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid w-64 gap-1 p-2">
                  <NavigationMenuLink href="#">Destinations</NavigationMenuLink>
                  <NavigationMenuLink href="#">Experiences</NavigationMenuLink>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>Journey</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>
                New
                <MenubarShortcut>⌘N</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>Duplicate</MenubarItem>
              <MenubarSeparator />
              <MenubarItem>Print summary</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>View</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>Now / Next / Later</MenubarItem>
              <MenubarItem>Day by day</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </Specimen>

      <Specimen name="Command" className="block">
        <Command className="rounded-md border border-border">
          <CommandInput placeholder="Search places, routes, actions" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup heading="Go to">
              <CommandItem>
                <MapIcon />
                Destinations
                <CommandShortcut>⌘D</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <CalendarIcon />
                Plan
                <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Settings">
              <CommandItem>
                <SettingsIcon />
                Language
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </Specimen>

      <Specimen name="Resizable" className="block">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-40 rounded-md border border-border"
        >
          <ResizablePanel defaultSize={35}>
            <div className="flex h-full items-center justify-center p-4 text-sm">Queue</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={65}>
            <div className="flex h-full items-center justify-center p-4 text-sm">Detail</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </Specimen>
    </Section>
  );
}
