import { ScreenSkeleton } from "../../../components/screen-skeleton";

/** The Prepare hub, while it loads. Nothing under `prepare/` calls `notFound()`. */
export default function PrepareLoading() {
  return <ScreenSkeleton />;
}
