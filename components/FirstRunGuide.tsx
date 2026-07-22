import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

type Step = {
  title: string;
  body: string;
  arrowLabel?: string;
};

const steps: Step[] = [
  {
    title: "Start here",
    body: "This is your liquid cash card. It shows the money you can actually use right now.",
    arrowLabel: "Look up here",
  },
  {
    title: "Track debts",
    body: "Open Debts to see what you owe, what is linked, and what was merged.",
    arrowLabel: "Then check debts",
  },
  {
    title: "Add a transaction",
    body: "Use the add/manual transaction button when you need to record cash or a transaction by hand.",
    arrowLabel: "Record new money here",
  },
  {
    title: "Manage your settings",
    body: "Use Profile for financial settings, SMS sync, and the opening liquid cash baseline.",
    arrowLabel: "Finish in Profile",
  },
];

interface FirstRunGuideProps {
  visible: boolean;
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

export default function FirstRunGuide({
  visible,
  step,
  onNext,
  onSkip,
}: FirstRunGuideProps) {
  const current = steps[Math.max(0, Math.min(step, steps.length - 1))];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 bg-black/60">
        <View className="flex-1">
          <View className="absolute inset-0 bg-black/35" />

          {step === 0 && (
            <View className="absolute left-4 right-4 top-[140px] border-2 border-blue-300 rounded-2xl" />
          )}
          {step === 1 && (
            <View className="absolute right-4 top-[610px] w-[58%] border-2 border-purple-300 rounded-2xl" />
          )}
          {step === 2 && (
            <View className="absolute right-4 top-[88px] w-[46%] border-2 border-emerald-300 rounded-2xl" />
          )}
          {step === 3 && (
            <View className="absolute right-4 bottom-[110px] w-[42%] border-2 border-pink-300 rounded-2xl" />
          )}

          <View className="absolute left-4 right-4 bottom-10 bg-white dark:bg-slate-900 rounded-[20px] p-5 border border-white/10">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-3">
                <Text className="text-slate-900 dark:text-white text-lg font-bold">
                  {current.title}
                </Text>
                <Text className="text-slate-600 dark:text-slate-300 text-sm mt-2 leading-5">
                  {current.body}
                </Text>
              </View>
              <TouchableOpacity onPress={onSkip} className="p-2 -mr-2 -mt-1">
                <FontAwesome name="times" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center justify-between mt-4">
              <View className="flex-row items-center gap-2">
                {steps.map((_, index) => (
                  <View
                    key={index}
                    className={`h-2 rounded-full ${index === step ? "w-6 bg-blue-600" : "w-2 bg-slate-300 dark:bg-slate-600"}`}
                  />
                ))}
              </View>
              <TouchableOpacity
                onPress={onNext}
                className="bg-blue-600 px-4 py-3 rounded-full flex-row items-center"
              >
                <Text className="text-white font-bold mr-2">
                  {step === steps.length - 1 ? "Done" : "Next"}
                </Text>
                <FontAwesome name="arrow-right" size={14} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 uppercase font-bold">
              {current.arrowLabel}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
