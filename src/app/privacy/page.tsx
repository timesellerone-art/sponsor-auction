import { LegalDocument, LegalSection } from '@/components/LegalDocument';

export default function PrivacyPage() {
  return (
    <LegalDocument kicker="Legal" title="개인정보처리방침" updated="2026년 10월 13일">
      <LegalSection title="1. 수집하는 개인정보">
        <p>
          회사는 회원가입, 캠페인·제안 처리, 결제 및 고객 지원을 위해 이름, 이메일, 역할,
          채널 URL, 결제 관련 주문번호·금액 정보를 수집합니다. 비밀번호는 암호화되어
          저장되거나 인증 제공자가 처리합니다.
        </p>
      </LegalSection>
      <LegalSection title="2. 이용 목적">
        <p>
          수집 정보는 회원 식별, 역경매 매칭, 낙찰·결제 처리, 알림 발송, 분쟁 대응, 법령상
          의무 이행에 사용합니다. 동의 없는 마케팅 목적 이용은 하지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="3. 보유 기간">
        <p>
          회원 탈퇴 시 지체 없이 파기합니다. 다만 전자상거래 등에서의 소비자보호에 관한
          법률에 따른 계약·결제 기록은 5년, 소비자 불만·분쟁 기록은 3년 보관할 수 있습니다.
        </p>
      </LegalSection>
      <LegalSection title="4. 제3자 제공 및 처리위탁">
        <p>
          결제는 토스페이먼츠 등 전자결제 사업자에게 필요한 범위만 전달됩니다. 인증은
          Supabase 등 위탁 인프라를 이용할 수 있습니다. 법령에 따른 경우를 제외하고 동의
          없이 제3자에게 제공하지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="5. 이용자의 권리">
        <p>
          회원은 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다. 문의는 서비스 내
          계정 설정 또는 고객 지원 채널을 이용해 주세요.
        </p>
      </LegalSection>
      <LegalSection title="6. 안전성 확보조치">
        <p>
          접근 권한 제한, 전송 구간 암호화, 결제 승인 시 주문 금액 검증 등 기술적·관리적
          보호조치를 시행합니다.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
