"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@mandhira/ui/components/ui/alert-dialog";
import { Button } from "@mandhira/ui/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@mandhira/ui/components/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@mandhira/ui/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@mandhira/ui/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@mandhira/ui/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@mandhira/ui/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@mandhira/ui/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@mandhira/ui/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@mandhira/ui/components/ui/tooltip";
import { Section, Specimen } from "./shell";

const SHEET_SIDES = ["right", "left", "top", "bottom"] as const;

export function Overlays() {
  return (
    <Section
      id="overlays"
      title="Overlays"
      summary="Dialog, AlertDialog, Sheet, Drawer, Popover, Tooltip, HoverCard, DropdownMenu and ContextMenu. Every one of these is a Base UI primitive, so the trigger takes a `render` prop where Radix took `asChild`."
    >
      <Specimen name="Dialog & AlertDialog">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move the Sarnath visit?</DialogTitle>
              <DialogDescription>
                Day 3 has two darshan windows close together, because the temple closes at noon.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Keep as is</DialogClose>
              <DialogClose render={<Button />}>Move it</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" />}>
            Open alert dialog
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this stop?</AlertDialogTitle>
              <AlertDialogDescription>
                It is marked Important, so the plan will be rebuilt around what is left.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep as is</AlertDialogCancel>
              <AlertDialogAction>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Specimen>

      <Specimen name="Sheet" note="All four sides">
        {SHEET_SIDES.map((side) => (
          <Sheet key={side}>
            <SheetTrigger render={<Button variant="outline" size="sm" />}>{side}</SheetTrigger>
            <SheetContent side={side}>
              <SheetHeader>
                <SheetTitle>Trust record</SheetTitle>
                <SheetDescription>
                  Where this came from, how fresh it is, and how confident we are.
                </SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <Button size="sm">Close</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ))}
      </Specimen>

      <Specimen name="Drawer">
        <Drawer>
          <DrawerTrigger render={<Button variant="outline" />}>Open drawer</DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Options for Day 3</DrawerTitle>
              <DrawerDescription>
                In order. Nothing here removes a Protected item.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button>Apply</Button>
              <DrawerClose render={<Button variant="ghost" />}>Keep as is</DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </Specimen>

      <Specimen name="Popover, Tooltip & HoverCard">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>Popover</PopoverTrigger>
          <PopoverContent className="w-72">
            <PopoverHeader>
              <PopoverTitle>Freshness</PopoverTitle>
              <PopoverDescription>
                Retrieved 3 days ago from the temple trust notice.
              </PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" />}>Tooltip</TooltipTrigger>
            <TooltipContent>Verified against a tier-1 source</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <HoverCard>
          <HoverCardTrigger render={<Button variant="link" />}>Hover card</HoverCardTrigger>
          <HoverCardContent className="w-72">
            <p className="text-sm font-medium">Kashi Vishwanath</p>
            <p className="text-xs text-muted-foreground">
              Open 3 am to 11 pm, with four aarti windows. Queue is shortest before 5 am.
            </p>
          </HoverCardContent>
        </HoverCard>
      </Specimen>

      <Specimen name="DropdownMenu & ContextMenu">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Dropdown menu
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>This stop</DropdownMenuLabel>
            <DropdownMenuItem>
              Open details
              <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>Change priority</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked>Show on map</DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ContextMenu>
          <ContextMenuTrigger className="flex h-16 w-56 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            Right-click here
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <ContextMenuItem>
              Add to journey
              <ContextMenuShortcut>⌘A</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem>Copy link</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Specimen>
    </Section>
  );
}
