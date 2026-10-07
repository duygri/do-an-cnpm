import { ArrowRight } from "lucide-react";
import { heroImage } from "./media";
export default function Hero() {
  return (
    <>
      <section className="relative min-h-[650px] overflow-hidden bg-black text-white lg:min-h-[760px]">
        <img
          src={heroImage}
          alt="NOVA Supply Drop 01 urban editorial"
          className="absolute inset-0 h-full w-full object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />
        <div className="relative mx-auto flex min-h-[650px] max-w-[1440px] items-end px-5 pb-12 sm:px-10 lg:min-h-[760px] lg:pb-20">
          <div className="max-w-4xl">
            <div className="mb-5 flex items-center gap-3 text-xs font-bold tracking-[.25em]">
              <span className="h-px w-10 bg-[#c8ff00]" />
              DROP 01 / 2026
            </div>
            <h1 className="font-display text-[clamp(5rem,15vw,12rem)] leading-[.72] tracking-[-.06em]">
              AFTER
              <br />
              <span className="text-[#c8ff00]">DARK</span>
            </h1>
            <p className="mt-8 max-w-lg text-sm leading-6 text-white/75 sm:text-base">
              Một bộ sưu tập dành cho những chuyển động không dừng lại khi thành
              phố lên đèn.
            </p>
            <a
              href="#shop"
              className="mt-7 inline-flex h-[52px] items-center gap-8 bg-[#c8ff00] px-6 text-xs font-black tracking-[.15em] text-black transition hover:bg-white"
            >
              SHOP THE DROP <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
        <p className="absolute bottom-10 right-10 hidden origin-bottom-right rotate-90 text-[10px] font-bold tracking-[.4em] text-white/50 lg:block">
          SAIGON — EST. 2026
        </p>
      </section>
    </>
  );
}
