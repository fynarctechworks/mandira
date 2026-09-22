import { ScreenSkeleton } from "../../../components/screen-skeleton";

/** Profile, while it loads. Nothing under `profile/` calls `notFound()`. */
export default function ProfileLoading() {
  return <ScreenSkeleton />;
}
